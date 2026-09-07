import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DraftStore } from '../../core/draft-store';
import { DrawingsApi } from '../../core/api/drawings.service';
import { toAppError } from '../../core/errors';

@Component({
  selector: 'app-upload-step',
  imports: [RouterLink],
  templateUrl: './upload-step.component.html',
  styleUrl: './upload-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadStepComponent {
  private readonly router = inject(Router);
  private readonly drawings = inject(DrawingsApi);
  readonly draft = inject(DraftStore);

  readonly dragging = signal(false);
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);

  readonly machine = this.draft.machine;
  readonly drawing = this.draft.drawing;

  readonly maxMb = computed(() => Math.round(this.machine().maxUploadBytes / (1024 * 1024)));
  readonly extensions = computed(() => this.machine().allowedExtensions.join(', '));

  constructor() {
    // Limits are the administrator's, so the client-side pre-check below can
    // only be as accurate as the config it has loaded.
    void this.draft.loadReferenceData();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.accept(file);
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.accept(file);
    input.value = '';
  }

  /**
   * Client-side pre-check mirrors the machine config so an obvious reject never
   * costs an upload. The server re-checks in the same order — this is a
   * courtesy, not the enforcement point.
   */
  private accept(file: File): void {
    this.error.set(null);
    const cfg = this.machine();
    const dot = file.name.lastIndexOf('.');
    const ext = dot === -1 ? '' : file.name.slice(dot).toLowerCase();

    if (!cfg.allowedExtensions.includes(ext)) {
      this.error.set(`“${file.name}” is not an accepted drawing. Upload a ${this.extensions()} file.`);
      return;
    }
    if (file.size > cfg.maxUploadBytes) {
      this.error.set(`“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${this.maxMb()} MB.`);
      return;
    }
    this.upload(file);
  }

  private upload(file: File): void {
    this.uploading.set(true);
    this.progress.set(0);

    this.drawings.upload(file).subscribe({
      next: (event) => {
        if (event.kind === 'progress') {
          this.progress.set(event.percent);
          return;
        }
        this.progress.set(100);
        this.uploading.set(false);
        this.draft.setDrawing(event.drawing);
      },
      error: (err: unknown) => {
        this.uploading.set(false);
        this.progress.set(0);
        // The server's parser message is the useful one ("only contains SPLINE",
        // "no cuttable geometry"), so it is surfaced verbatim.
        this.error.set(toAppError(err).message);
      },
    });
  }

  replace(): void {
    this.draft.reset();
    this.progress.set(0);
    this.error.set(null);
  }

  next(): void {
    void this.router.navigate(['/quotes/new/bends']);
  }
}
