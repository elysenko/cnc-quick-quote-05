import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DraftStore } from '../../core/draft-store';
import { demoDrawing } from '../../core/demo-geometry';

@Component({
  selector: 'app-upload-step',
  imports: [RouterLink],
  templateUrl: './upload-step.component.html',
  styleUrl: './upload-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadStepComponent {
  private readonly router = inject(Router);
  readonly draft = inject(DraftStore);

  readonly dragging = signal(false);
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);

  readonly machine = this.draft.machine;
  readonly drawing = this.draft.drawing;

  readonly maxMb = computed(() => Math.round(this.machine().maxUploadBytes / (1024 * 1024)));
  readonly extensions = computed(() => this.machine().allowedExtensions.join(', '));

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

  /** Client-side pre-check mirrors the machine config, so obvious rejects never hit the wire. */
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
    this.simulateUpload(file.name);
  }

  private simulateUpload(filename: string): void {
    this.uploading.set(true);
    this.progress.set(0);
    const timer = setInterval(() => {
      const next = this.progress() + 20;
      if (next >= 100) {
        clearInterval(timer);
        this.progress.set(100);
        this.uploading.set(false);
        this.draft.drawing.set({ ...demoDrawing(), filename });
        this.draft.persist();
      } else {
        this.progress.set(next);
      }
    }, 130);
  }

  replace(): void {
    this.draft.drawing.set(null);
    this.progress.set(0);
  }

  next(): void {
    void this.router.navigate(['/quotes/new/bends']);
  }
}
