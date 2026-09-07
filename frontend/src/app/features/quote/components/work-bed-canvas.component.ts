import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { BendLine, NestResult, Placement, Polyline } from '../../../core/models';

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  len: number;
}

/** Hard cap on ANIMATED parts so per-frame work stays bounded on dense nestings.
 *  Every nested part is still drawn statically — only the laser traversal is capped. */
const MAX_ANIMATED_PARTS = 12;

@Component({
  selector: 'app-work-bed-canvas',
  templateUrl: './work-bed-canvas.component.html',
  styleUrl: './work-bed-canvas.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkBedCanvasComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);

  readonly polylines = input.required<Polyline[]>();
  readonly bends = input<BendLine[]>([]);
  readonly partW = input.required<number>();
  readonly partH = input.required<number>();
  readonly sheetW = input.required<number>();
  readonly sheetH = input.required<number>();
  readonly nesting = input<NestResult | null>(null);
  readonly speed = input(320);
  readonly sheetIndex = input(1);

  private readonly frame = viewChild.required<ElementRef<HTMLDivElement>>('frame');
  private readonly staticCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('staticLayer');
  private readonly cutCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cutLayer');
  private readonly activeCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('activeLayer');

  readonly running = signal(true);
  readonly progressPct = signal(0);

  private observer: ResizeObserver | null = null;
  private rafId = 0;
  private lastTs = 0;
  private scale = 1;
  private dpr = 1;
  private width = 0;
  private height = 0;

  private segments: Segment[] = [];
  private totalLength = 0;
  private segIndex = 0;
  private segProgress = 0;
  private travelled = 0;

  /** Every part nested on this sheet — drawn statically, so the layout reads in full. */
  readonly placements = computed<Placement[]>(() => {
    const nest = this.nesting();
    if (nest && nest.placements.length > 0) return nest.placements;
    return [{ x: 12, y: 12 }];
  });

  /** The subset the laser actually traverses, so per-frame work stays bounded. */
  readonly animated = computed<Placement[]>(() => this.placements().slice(0, MAX_ANIMATED_PARTS));

  readonly caption = computed(() => {
    const nest = this.nesting();
    if (!nest) return 'Part does not fit the selected sheet';
    const total = this.placements().length;
    const shown = this.animated().length;
    const suffix = total > shown ? ` · cutting first ${shown} of ${total}` : '';
    return `Sheet ${this.sheetIndex()} of ${nest.sheetCount} · ${nest.cols}×${nest.rows} grid${suffix}`;
  });

  constructor() {
    // Geometry or layout inputs changed → rebuild the segment list and restart.
    effect(() => {
      this.polylines();
      this.animated();
      this.bends();
      this.sheetW();
      this.sheetH();
      queueMicrotask(() => this.rebuild());
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.frame().nativeElement);
      this.resize();
      this.start();
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.rafId);
  }

  toggle(): void {
    if (this.running()) {
      this.stop();
    } else {
      this.start();
    }
  }

  /** Stopping resets progress to zero, per the Print Bed control contract. */
  stop(): void {
    this.running.set(false);
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.resetProgress();
    this.clear(this.ctx(this.cutCanvas()));
    this.clear(this.ctx(this.activeCanvas()));
  }

  start(): void {
    if (this.rafId) return;
    this.running.set(true);
    this.lastTs = 0;
    this.zone.runOutsideAngular(() => {
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    });
  }

  private resetProgress(): void {
    this.segIndex = 0;
    this.segProgress = 0;
    this.travelled = 0;
    this.progressPct.set(0);
  }

  private ctx(ref: ElementRef<HTMLCanvasElement>): CanvasRenderingContext2D | null {
    return ref.nativeElement.getContext('2d');
  }

  private clear(ctx: CanvasRenderingContext2D | null): void {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
    ctx.restore();
  }

  /**
   * Recomputes a fit-to-viewport scale that preserves the sheet aspect ratio —
   * content is never clipped or distorted at any container size.
   */
  private resize(): void {
    const host = this.frame().nativeElement;
    const boxW = Math.max(160, host.clientWidth);
    const aspect = this.sheetH() / this.sheetW();
    const boxH = Math.max(140, Math.min(boxW * aspect, 460));

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = boxW;
    this.height = boxH;
    this.scale = Math.min(boxW / this.sheetW(), boxH / this.sheetH());

    for (const ref of [this.staticCanvas(), this.cutCanvas(), this.activeCanvas()]) {
      const el = ref.nativeElement;
      el.width = Math.round(boxW * this.dpr);
      el.height = Math.round(boxH * this.dpr);
      el.style.width = `${boxW}px`;
      el.style.height = `${boxH}px`;
      el.getContext('2d')?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    this.drawStatic();
    this.replayCompleted();
  }

  private rebuild(): void {
    this.segments = this.buildSegments();
    this.totalLength = this.segments.reduce((sum, s) => sum + s.len, 0);
    this.resetProgress();
    this.clear(this.ctx(this.cutCanvas()));
    this.clear(this.ctx(this.activeCanvas()));
    this.drawStatic();
  }

  private buildSegments(): Segment[] {
    const segs: Segment[] = [];
    for (const origin of this.animated()) {
      for (const pl of this.polylines()) {
        const pts = pl.points;
        const count = pl.closed ? pts.length : pts.length - 1;
        for (let i = 0; i < count; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const x1 = origin.x + a[0];
          const y1 = origin.y + a[1];
          const x2 = origin.x + b[0];
          const y2 = origin.y + b[1];
          segs.push({ x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1) });
        }
      }
    }
    return segs;
  }

  private drawStatic(): void {
    const ctx = this.ctx(this.staticCanvas());
    if (!ctx) return;
    this.clear(ctx);
    const s = this.scale;
    const sw = this.sheetW() * s;
    const sh = this.sheetH() * s;

    ctx.fillStyle = '#10151f';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#1c2637';
    ctx.fillRect(0, 0, sw, sh);

    ctx.strokeStyle = '#26324a';
    ctx.lineWidth = 1;
    const gridMm = 100;
    ctx.beginPath();
    for (let x = gridMm; x < this.sheetW(); x += gridMm) {
      ctx.moveTo(x * s, 0);
      ctx.lineTo(x * s, sh);
    }
    for (let y = gridMm; y < this.sheetH(); y += gridMm) {
      ctx.moveTo(0, y * s);
      ctx.lineTo(sw, y * s);
    }
    ctx.stroke();

    ctx.strokeStyle = '#3d4c6b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.5, 0.5, sw - 1, sh - 1);

    // Faint outline of every placed part, so the layout reads before the cut runs.
    ctx.strokeStyle = 'rgba(152, 162, 184, 0.35)';
    ctx.lineWidth = 1;
    for (const p of this.placements()) {
      ctx.strokeRect(p.x * s, p.y * s, this.partW() * s, this.partH() * s);
    }

    ctx.fillStyle = '#6b7896';
    ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(`${this.sheetW()} × ${this.sheetH()} mm`, 6, sh - 8);
  }

  /** Redraws the already-cut portion after a resize — O(n), resize only. */
  private replayCompleted(): void {
    const ctx = this.ctx(this.cutCanvas());
    if (!ctx) return;
    this.clear(ctx);
    this.styleCut(ctx);
    ctx.beginPath();
    for (let i = 0; i < this.segIndex && i < this.segments.length; i++) {
      const seg = this.segments[i];
      ctx.moveTo(seg.x1 * this.scale, seg.y1 * this.scale);
      ctx.lineTo(seg.x2 * this.scale, seg.y2 * this.scale);
    }
    ctx.stroke();
    this.drawBends();
  }

  private styleCut(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--machine-cut').trim() || '#1e4fd8';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
  }

  private drawBends(): void {
    const ctx = this.ctx(this.cutCanvas());
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--machine-bend').trim() || '#ea6a0c';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (const origin of this.animated()) {
      for (const b of this.bends()) {
        ctx.moveTo((origin.x + b.sx) * this.scale, (origin.y + b.sy) * this.scale);
        ctx.lineTo((origin.x + b.ex) * this.scale, (origin.y + b.ey) * this.scale);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  private tick(ts: number): void {
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05);
    this.lastTs = ts;

    let advance = this.speed() * dt;
    const cutCtx = this.ctx(this.cutCanvas());
    if (cutCtx) {
      this.styleCut(cutCtx);
      cutCtx.beginPath();
    }
    let headX = 0;
    let headY = 0;

    while (advance > 0 && this.segIndex < this.segments.length) {
      const seg = this.segments[this.segIndex];
      const remaining = seg.len - this.segProgress;
      const ux = seg.len === 0 ? 0 : (seg.x2 - seg.x1) / seg.len;
      const uy = seg.len === 0 ? 0 : (seg.y2 - seg.y1) / seg.len;
      const fromX = seg.x1 + ux * this.segProgress;
      const fromY = seg.y1 + uy * this.segProgress;

      if (advance >= remaining) {
        cutCtx?.moveTo(fromX * this.scale, fromY * this.scale);
        cutCtx?.lineTo(seg.x2 * this.scale, seg.y2 * this.scale);
        headX = seg.x2;
        headY = seg.y2;
        advance -= remaining;
        this.travelled += remaining;
        this.segIndex += 1;
        this.segProgress = 0;
      } else {
        const toX = fromX + ux * advance;
        const toY = fromY + uy * advance;
        cutCtx?.moveTo(fromX * this.scale, fromY * this.scale);
        cutCtx?.lineTo(toX * this.scale, toY * this.scale);
        headX = toX;
        headY = toY;
        this.segProgress += advance;
        this.travelled += advance;
        advance = 0;
      }
    }
    cutCtx?.stroke();

    if (this.segIndex >= this.segments.length) {
      this.drawBends();
      this.clear(this.ctx(this.activeCanvas()));
      this.zone.run(() => this.progressPct.set(100));
      this.rafId = 0;
      this.running.set(false);
      return;
    }

    this.drawHead(headX, headY);
    const pct = this.totalLength > 0 ? Math.round((this.travelled / this.totalLength) * 100) : 0;
    if (pct !== this.progressPct()) this.zone.run(() => this.progressPct.set(pct));

    this.rafId = requestAnimationFrame((next) => this.tick(next));
  }

  private drawHead(x: number, y: number): void {
    const ctx = this.ctx(this.activeCanvas());
    if (!ctx) return;
    this.clear(ctx);
    const px = x * this.scale;
    const py = y * this.scale;
    ctx.save();
    const glow = ctx.createRadialGradient(px, py, 0, px, py, 12);
    glow.addColorStop(0, 'rgba(255, 214, 140, 0.95)');
    glow.addColorStop(1, 'rgba(234, 106, 12, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6e6';
    ctx.beginPath();
    ctx.arc(px, py, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
