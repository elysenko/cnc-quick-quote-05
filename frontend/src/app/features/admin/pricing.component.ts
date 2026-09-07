import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DraftStore } from '../../core/draft-store';
import { PricingConfig } from '../../core/models';

@Component({
  selector: 'app-admin-pricing',
  imports: [FormsModule],
  templateUrl: './pricing.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingComponent {
  private readonly store = inject(DraftStore);

  readonly form = signal<PricingConfig>({ ...this.store.pricing() });
  readonly dirty = signal(false);
  readonly saved = signal(false);

  patch<K extends keyof PricingConfig>(key: K, value: PricingConfig[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.dirty.set(true);
    this.saved.set(false);
  }

  save(): void {
    this.store.pricing.set({ ...this.form() });
    this.dirty.set(false);
    this.saved.set(true);
  }

  reset(): void {
    this.form.set({ ...this.store.pricing() });
    this.dirty.set(false);
    this.saved.set(false);
  }
}
