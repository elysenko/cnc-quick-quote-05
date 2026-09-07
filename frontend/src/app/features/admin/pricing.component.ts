import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api/admin.service';
import { toAppError } from '../../core/errors';
import { PricingConfig } from '../../core/models';

/** Neutral placeholder held only until the first response from GET /admin/pricing lands. */
const BLANK: PricingConfig = {
  setupFee: 0,
  costPerLinearFoot: 0,
  perSheetCost: 0,
  handlingFee: 0,
  costPerBend: 0,
  minimumOrder: 0,
};

@Component({
  selector: 'app-admin-pricing',
  imports: [FormsModule],
  templateUrl: './pricing.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingComponent {
  private readonly api = inject(AdminApi);
  private original: PricingConfig = BLANK;

  readonly form = signal<PricingConfig>(BLANK);
  readonly dirty = signal(false);
  readonly saved = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const config = await firstValueFrom(this.api.pricing());
      this.original = config;
      this.form.set({ ...config });
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  patch<K extends keyof PricingConfig>(key: K, value: PricingConfig[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.dirty.set(true);
    this.saved.set(false);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.api.savePricing(this.form()));
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
