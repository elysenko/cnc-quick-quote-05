import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CheckoutStore } from './checkout.store';
import { money } from '../../core/models';

@Component({
  selector: 'app-review-step',
  imports: [RouterLink],
  templateUrl: './review-step.component.html',
  styleUrl: './checkout-steps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewStepComponent implements OnInit {
  readonly checkout = inject(CheckoutStore);

  readonly quoteId = input<string>('');
  /** `?status=cancelled` — Stripe returned the customer without charging. */
  readonly status = input<string | undefined>();

  readonly money = money;
  readonly cancelled = computed(() => this.status() === 'cancelled');

  readonly summary = this.checkout.summary;
  readonly loading = this.checkout.summaryLoading;
  readonly error = this.checkout.summaryError;

  ngOnInit(): void {
    void this.checkout.loadSummary(this.quoteId());
  }
}
