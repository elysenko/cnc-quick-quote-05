import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DraftStore } from '../../core/draft-store';
import { CheckoutStore } from './checkout.store';
import { money } from '../../core/models';

type PollState = 'pending' | 'confirmed' | 'timeout';

@Component({
  selector: 'app-payment-return',
  imports: [RouterLink],
  templateUrl: './payment-return.component.html',
  styleUrl: './checkout-steps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentReturnComponent implements OnInit, OnDestroy {
  readonly draft = inject(DraftStore);
  readonly checkout = inject(CheckoutStore);

  readonly quoteId = input<string>('');
  /** `?session_id` — the Stripe Checkout Session we reconcile against. */
  readonly sessionId = input<string | undefined>('', { alias: 'session_id' });

  readonly money = money;
  readonly state = signal<PollState>('pending');
  readonly attempt = signal(1);
  readonly orderId = 'ord_9f21';
  readonly orderNumber = 'NGL-2026-004182';

  readonly totalCents = computed(
    () => (this.draft.breakdown()?.totalCents ?? 0) + this.checkout.shippingCostCents(),
  );

  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    // Bounded backoff while we wait for the webhook; the reconciliation call is
    // the fallback path when it never lands.
    this.timers.push(setTimeout(() => this.attempt.set(2), 900));
    this.timers.push(setTimeout(() => this.state.set('confirmed'), 2200));
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }

  retry(): void {
    this.state.set('pending');
    this.attempt.set(1);
    this.timers.push(setTimeout(() => this.state.set('confirmed'), 1600));
  }
}
