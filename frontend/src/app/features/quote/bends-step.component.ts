import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DraftStore } from '../../core/draft-store';
import { DrawingsApi } from '../../core/api/drawings.service';
import { BendDirection } from '../../core/models';
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
  private readonly drawings = inject(DrawingsApi);
  readonly draft = inject(DraftStore);

  readonly drawing = this.draft.drawing;
  readonly bends = this.draft.bends;
  readonly selectedId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly bendCount = computed(() => this.bends().length);

  constructor() {
    // Restores the drawing and its saved bends when this step is deep-linked.
    void this.draft.restore();
  }

  select(id: string | null): void {
    this.selectedId.set(id);
  }

  /**
   * Bend edits are written through to the server. The local signal updates
   * first so the canvas stays responsive under a drag; a failed write reverts
   * by re-reading the server's list, which is the only source of truth.
   */
  onDrawn(coords: { sx: number; sy: number; ex: number; ey: number }): void {
    const dwg = this.drawing();
    if (!dwg) return;
    void this.persist(async () => {
      const created = await firstValueFrom(
        this.drawings.createBend(dwg.id, { ...coords, angleDeg: 90, direction: 'up' }),
      );
      this.draft.addBend(created);
      this.selectedId.set(created.id);
    });
  }

  onMoved(update: { id: string; sx: number; sy: number; ex: number; ey: number }): void {
    const { id, ...patch } = update;
    this.draft.updateBend(id, patch);
    void this.persist(() => firstValueFrom(this.drawings.updateBend(id, patch)));
  }

  setAngle(id: string, value: string | number): void {
    const angleDeg = Math.max(0, Math.min(180, Number(value) || 0));
    this.draft.updateBend(id, { angleDeg });
    void this.persist(() => firstValueFrom(this.drawings.updateBend(id, { angleDeg })));
  }

  setDirection(id: string, direction: BendDirection): void {
    this.draft.updateBend(id, { direction });
    void this.persist(() => firstValueFrom(this.drawings.updateBend(id, { direction })));
  }

  remove(id: string): void {
    this.draft.removeBend(id);
    if (this.selectedId() === id) this.selectedId.set(null);
    void this.persist(() => firstValueFrom(this.drawings.deleteBend(id)));
  }

  private async persist(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
      this.error.set(null);
    } catch {
      this.error.set('That bend could not be saved. Your drawing is unchanged.');
      await this.draft.reloadBends();
    }
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
