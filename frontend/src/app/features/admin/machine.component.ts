import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api/admin.service';
import { toAppError } from '../../core/errors';
import { MachineConfig } from '../../core/models';

/** Neutral placeholder held only until the first response from GET /admin/machine lands. */
const BLANK: MachineConfig = {
  minQuantity: 1,
  maxQuantity: 500,
  maxUploadBytes: 10 * 1024 * 1024,
  allowedExtensions: ['.dxf'],
  sheetSpacingMm: 6,
  sheetMarginMm: 12,
  animationSpeed: 320,
};

@Component({
  selector: 'app-admin-machine',
  imports: [FormsModule],
  templateUrl: './machine.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineComponent {
  private readonly api = inject(AdminApi);
  private original: MachineConfig = BLANK;

  readonly form = signal<MachineConfig>(BLANK);
  readonly dirty = signal(false);
  readonly saved = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly maxUploadMb = computed(() => Math.round(this.form().maxUploadBytes / (1024 * 1024)));
  readonly extensionText = computed(() => this.form().allowedExtensions.join(', '));

  readonly quantityError = computed(() =>
    this.form().minQuantity > this.form().maxQuantity
      ? 'Minimum quantity cannot be greater than the maximum.'
      : null,
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const config = await firstValueFrom(this.api.machine());
      this.original = config;
      this.form.set({ ...config });
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

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

  async save(): Promise<void> {
    if (this.quantityError()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.api.saveMachine(this.form()));
      this.original = saved;
      this.form.set({ ...saved });
      this.dirty.set(false);
      this.saved.set(true);
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.saving.set(false);
    }
  }

  reset(): void {
    this.form.set({ ...this.original });
    this.dirty.set(false);
    this.saved.set(false);
  }
}
