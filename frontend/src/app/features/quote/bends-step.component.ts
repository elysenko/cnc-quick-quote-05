import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DraftStore } from '../../core/draft-store';
import { BendDirection, BendLine } from '../../core/models';
import { BendEditorCanvasComponent } from './components/bend-editor-canvas.component';

@Component({
  selector: 'app-bends-step',
  imports: [FormsModule, BendEditorCanvasComponent],
  templateUrl: './bends-step.component.html',
  styleUrl: './bends-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BendsStepComponent {
  private readonly router = inject(Router);
  readonly draft = inject(DraftStore);

  readonly drawing = this.draft.drawing;
  readonly bends = this.draft.bends;
  readonly selectedId = signal<string | null>(null);

  readonly bendCount = computed(() => this.bends().length);

  private nextId = 100;

  select(id: string | null): void {
    this.selectedId.set(id);
  }

  onDrawn(coords: { sx: number; sy: number; ex: number; ey: number }): void {
    const dwg = this.drawing();
    if (!dwg) return;
    const bend: BendLine = {
      id: `bnd_${this.nextId++}`,
      drawingId: dwg.id,
      ...coords,
      angleDeg: 90,
      direction: 'up',
    };
    this.draft.addBend(bend);
    this.selectedId.set(bend.id);
  }

  onMoved(update: { id: string; sx: number; sy: number; ex: number; ey: number }): void {
    const { id, ...patch } = update;
    this.draft.updateBend(id, patch);
  }

  setAngle(id: string, value: string | number): void {
    const angle = Math.max(0, Math.min(180, Number(value) || 0));
    this.draft.updateBend(id, { angleDeg: angle });
  }

  setDirection(id: string, direction: BendDirection): void {
    this.draft.updateBend(id, { direction });
  }

  remove(id: string): void {
    this.draft.removeBend(id);
    if (this.selectedId() === id) this.selectedId.set(null);
  }

  addManual(): void {
    const dwg = this.drawing();
    if (!dwg) return;
    const offset = 20 + this.bends().length * 14;
    this.onDrawn({ sx: 0, sy: Math.min(offset, dwg.bboxHMm), ex: dwg.bboxWMm, ey: Math.min(offset, dwg.bboxHMm) });
  }

  back(): void {
    void this.router.navigate(['/quotes/new/upload']);
  }

  next(): void {
    void this.router.navigate(['/quotes/new/material']);
  }
}
