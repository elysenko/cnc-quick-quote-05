import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DraftStore } from '../../core/draft-store';
import { MachineConfig } from '../../core/models';

@Component({
  selector: 'app-admin-machine',
  imports: [FormsModule],
  templateUrl: './machine.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineComponent {
  private readonly store = inject(DraftStore);

  readonly form = signal<MachineConfig>({ ...this.store.machine() });
  readonly dirty = signal(false);
  readonly saved = signal(false);

  readonly maxUploadMb = computed(() => Math.round(this.form().maxUploadBytes / (1024 * 1024)));
  readonly extensionText = computed(() => this.form().allowedExtensions.join(', '));

  readonly quantityError = computed(() =>
    this.form().minQuantity > this.form().maxQuantity
      ? 'Minimum quantity cannot be greater than the maximum.'
      : null,
  );

  patch<K extends keyof MachineConfig>(key: K, value: MachineConfig[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.dirty.set(true);
    this.saved.set(false);
  }

  setUploadMb(mb: number): void {
    this.patch('maxUploadBytes', Math.max(1, Math.round(mb)) * 1024 * 1024);
  }

  setExtensions(text: string): void {
    this.patch(
      'allowedExtensions',
      text
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  save(): void {
    if (this.quantityError()) return;
    this.store.machine.set({ ...this.form() });
    this.dirty.set(false);
    this.saved.set(true);
  }

  reset(): void {
    this.form.set({ ...this.store.machine() });
    this.dirty.set(false);
    this.saved.set(false);
  }
}
