import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BendLine, Polyline } from '../../../core/models';

interface DragState {
  mode: 'new' | 'start' | 'end' | 'move';
  id: string | null;
  originX: number;
  originY: number;
  base?: BendLine;
}

const HANDLE_HIT_PX = 12;

@Component({
  selector: 'app-bend-editor-canvas',
  templateUrl: './bend-editor-canvas.component.html',
  styleUrl: './bend-editor-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendEditorCanvasComponent implements AfterViewInit, OnDestroy {
  readonly polylines = input.required<Polyline[]>();
  readonly bends = input.required<BendLine[]>();
  readonly partW = input.required<number>();
  readonly partH = input.required<number>();
  readonly selectedId = input<string | null>(null);

  readonly bendDrawn = output<{ sx: number; sy: number; ex: number; ey: number }>();
  readonly bendMoved = output<{ id: string; sx: number; sy: number; ex: number; ey: number }>();
  readonly selected = output<string | null>();
  readonly deleteRequested = output<string>();

  private readonly frame = viewChild.required<ElementRef<HTMLDivElement>>('frame');
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly hint = signal('Drag across the part to draw a bend line.');

  private observer: ResizeObserver | null = null;
  private scale = 1;
  private padding = 16;
  private width = 0;
  private height = 0;
  private drag: DragState | null = null;
  private preview: { sx: number; sy: number; ex: number; ey: number } | null = null;

  constructor() {
    effect(() => {
      this.polylines();
      this.bends();
      this.selectedId();
      queueMicrotask(() => this.draw());
    });
  }

  ngAfterViewInit(): void {
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.frame().nativeElement);
    this.resize();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private resize(): void {
    const host = this.frame().nativeElement;
    const boxW = Math.max(200, host.clientWidth);
    const aspect = this.partH() / this.partW();
    const boxH = Math.max(180, Math.min(boxW * aspect + this.padding * 2, 420));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.width = boxW;
    this.height = boxH;
    this.scale = Math.min(
      (boxW - this.padding * 2) / this.partW(),
      (boxH - this.padding * 2) / this.partH(),
    );

    const el = this.canvasRef().nativeElement;
    el.width = Math.round(boxW * dpr);
    el.height = Math.round(boxH * dpr);
    el.style.width = `${boxW}px`;
    el.style.height = `${boxH}px`;
    el.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private toCanvas(x: number, y: number): [number, number] {
    return [this.padding + x * this.scale, this.padding + y * this.scale];
  }

  private toPart(clientX: number, clientY: number): [number, number] {
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    const x = (clientX - rect.left - this.padding) / this.scale;
    const y = (clientY - rect.top - this.padding) / this.scale;
    return [
      Math.max(0, Math.min(this.partW(), Math.round(x * 10) / 10)),
      Math.max(0, Math.min(this.partH(), Math.round(y * 10) / 10)),
    ];
  }

  onPointerDown(event: PointerEvent): void {
    const [px, py] = this.toPart(event.clientX, event.clientY);
    const tolerance = HANDLE_HIT_PX / this.scale;

    for (const b of this.bends()) {
      if (Math.hypot(px - b.sx, py - b.sy) <= tolerance) {
        this.begin({ mode: 'start', id: b.id, originX: px, originY: py, base: b }, event);
        return;
      }
      if (Math.hypot(px - b.ex, py - b.ey) <= tolerance) {
        this.begin({ mode: 'end', id: b.id, originX: px, originY: py, base: b }, event);
        return;
      }
      if (this.distanceToSegment(px, py, b) <= tolerance) {
        this.begin({ mode: 'move', id: b.id, originX: px, originY: py, base: b }, event);
        return;
      }
    }

    this.selected.emit(null);
    this.preview = { sx: px, sy: py, ex: px, ey: py };
    this.begin({ mode: 'new', id: null, originX: px, originY: py }, event);
    this.hint.set('Release to place the bend line.');
  }

  private begin(state: DragState, event: PointerEvent): void {
    this.drag = state;
    if (state.id) this.selected.emit(state.id);
    this.canvasRef().nativeElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    const [px, py] = this.toPart(event.clientX, event.clientY);
    const d = this.drag;

    if (d.mode === 'new' && this.preview) {
      this.preview = { ...this.preview, ex: px, ey: py };
      this.draw();
      return;
    }
    if (!d.base || !d.id) return;

    if (d.mode === 'start') {
      this.bendMoved.emit({ id: d.id, sx: px, sy: py, ex: d.base.ex, ey: d.base.ey });
    } else if (d.mode === 'end') {
      this.bendMoved.emit({ id: d.id, sx: d.base.sx, sy: d.base.sy, ex: px, ey: py });
    } else {
      const dx = px - d.originX;
      const dy = py - d.originY;
      this.bendMoved.emit({
        id: d.id,
        sx: this.clampX(d.base.sx + dx),
        sy: this.clampY(d.base.sy + dy),
        ex: this.clampX(d.base.ex + dx),
        ey: this.clampY(d.base.ey + dy),
      });
    }
  }

  onPointerUp(event: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    this.canvasRef().nativeElement.releasePointerCapture?.(event.pointerId);

    if (d?.mode === 'new' && this.preview) {
      const p = this.preview;
      this.preview = null;
      const length = Math.hypot(p.ex - p.sx, p.ey - p.sy);
      if (length >= 4) {
        this.bendDrawn.emit(p);
        this.hint.set('Bend added. Adjust the angle and direction in the list.');
      } else {
        this.hint.set('Drag further to draw a bend line — that was too short.');
      }
      this.draw();
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    const id = this.selectedId();
    if (!id) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteRequested.emit(id);
      this.hint.set('Bend removed.');
    }
  }

  private clampX(v: number): number {
    return Math.max(0, Math.min(this.partW(), Math.round(v * 10) / 10));
  }

  private clampY(v: number): number {
    return Math.max(0, Math.min(this.partH(), Math.round(v * 10) / 10));
  }

  private distanceToSegment(px: number, py: number, b: BendLine): number {
    const dx = b.ex - b.sx;
    const dy = b.ey - b.sy;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - b.sx, py - b.sy);
    let t = ((px - b.sx) * dx + (py - b.sy) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (b.sx + t * dx), py - (b.sy + t * dy));
  }

  private draw(): void {
    const ctx = this.canvasRef().nativeElement.getContext('2d');
    if (!ctx || this.width === 0) return;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#10151f';
    ctx.fillRect(0, 0, this.width, this.height);

    const styles = getComputedStyle(document.documentElement);
    const cut = styles.getPropertyValue('--machine-cut').trim() || '#1e4fd8';
    const bend = styles.getPropertyValue('--machine-bend').trim() || '#ea6a0c';

    // Part geometry
    ctx.strokeStyle = cut;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const pl of this.polylines()) {
      const pts = pl.points;
      const count = pl.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < count; i++) {
        const a = this.toCanvas(pts[i][0], pts[i][1]);
        const c = this.toCanvas(pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1]);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(c[0], c[1]);
      }
    }
    ctx.stroke();

    // Bends
    for (const b of this.bends()) {
      const isSelected = b.id === this.selectedId();
      const a = this.toCanvas(b.sx, b.sy);
      const c = this.toCanvas(b.ex, b.ey);
      ctx.strokeStyle = bend;
      ctx.lineWidth = isSelected ? 2.6 : 1.6;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = isSelected ? '#fff6e6' : bend;
      for (const h of [a, c]) {
        ctx.beginPath();
        ctx.arc(h[0], h[1], isSelected ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = bend;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // In-flight preview
    if (this.preview) {
      const a = this.toCanvas(this.preview.sx, this.preview.sy);
      const c = this.toCanvas(this.preview.ex, this.preview.ey);
      ctx.strokeStyle = '#fff6e6';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.stroke();
    }
  }
}
