import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandingService } from '../../core/branding.service';
import { CheckoutStore } from './checkout.store';
import { toAppError } from '../../core/errors';
import { money } from '../../core/models';

@Component({
  selector: 'app-shipping-step',
  imports: [RouterLink],
  templateUrl: './shipping-step.component.html',
  styleUrl: './checkout-steps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingStepComponent implements OnInit {
  readonly checkout = inject(CheckoutStore);
  readonly branding = inject(BrandingService);

  readonly quoteId = input<string>('');
  readonly money = money;

  readonly methods = this.checkout.methods;
  readonly sheetCount = computed(() => this.checkout.summary()?.sheetCount ?? 1);

  readonly loading = computed(() => this.checkout.methodsLoading() || this.checkout.summaryLoading());
  readonly blocked = computed(() => !this.loading() && this.checkout.methodsBlocked());

  readonly partsCents = computed(() => this.checkout.summary()?.partsCents ?? 0);
  readonly selectedCostCents = this.checkout.shippingCostCents;
  readonly grandTotalCents = computed(() => this.partsCents() + this.selectedCostCents());

  readonly submitting = signal(false);
  readonly payError = signal<string | null>(null);

  ngOnInit(): void {
    void this.checkout.loadSummary(this.quoteId());
    void this.checkout.loadShippingMethods(this.quoteId());
  }

  select(id: string): void {
    this.checkout.select(id);
  }

  /** Creates a real Stripe Checkout Session and hands the browser off to it. */
  async pay(): Promise<void> {
    const methodId = this.checkout.selectedMethodId();
    if (this.blocked() || !methodId || this.submitting()) return;

    this.submitting.set(true);
    this.payError.set(null);
    try {
      const { url } = await this.checkout.createSession(this.quoteId(), methodId);
      window.location.href = url;
    } catch (err) {
      this.payError.set(toAppError(err).message);
      this.submitting.set(false);
    }
  }
}
