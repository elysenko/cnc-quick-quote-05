import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DraftStore } from '../../core/draft-store';
import { BrandingService } from '../../core/branding.service';
import { CheckoutStore } from './checkout.store';
import { money } from '../../core/models';

@Component({
  selector: 'app-shipping-step',
  imports: [RouterLink],
  templateUrl: './shipping-step.component.html',
  styleUrl: './checkout-steps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingStepComponent {
  private readonly router = inject(Router);
  readonly draft = inject(DraftStore);
  readonly checkout = inject(CheckoutStore);
  readonly branding = inject(BrandingService);

  readonly quoteId = input<string>('');
  readonly money = money;

  readonly methods = computed(() =>
    this.checkout.activeMethods().map((m) => ({
      ...m,
      resolvedCostCents:
        m.kind === 'per_sheet'
          ? Math.round(m.rate * 100 * (this.draft.nesting()?.sheetCount ?? 1))
          : Math.round(m.rate * 100),
    })),
  );

  readonly blocked = computed(() => this.methods().length === 0);

  readonly selectedCostCents = computed(
    () => this.methods().find((m) => m.id === this.checkout.selectedMethodId())?.resolvedCostCents ?? 0,
  );

  readonly partsCents = computed(() => this.draft.breakdown()?.totalCents ?? 0);
  readonly grandTotalCents = computed(() => this.partsCents() + this.selectedCostCents());

  select(id: string): void {
    this.checkout.select(id);
  }

  /** Hands off to Stripe Checkout; the reviewer sees the return route instead. */
  pay(): void {
    if (this.blocked()) return;
    void this.router.navigate(['/checkout', this.quoteId(), 'payment'], {
      queryParams: { session_id: 'cs_test_a1B2c3D4e5F6g7H8' },
    });
  }
}
