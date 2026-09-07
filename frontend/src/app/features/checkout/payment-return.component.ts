import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CheckoutApi } from '../../core/api/checkout.service';
import { money } from '../../core/models';

type PollState = 'pending' | 'confirmed' | 'timeout';

/** Backoff (ms) between reconciliation checks: ~1s, 2s, 4s, 8s, 8s (~23s total). */
const POLL_DELAYS_MS = [1000, 2000, 4000, 8000, 8000];

@Component({
  selector: 'app-payment-return',
  imports: [RouterLink],
  templateUrl: './payment-return.component.html',
  styleUrl: './checkout-steps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentReturnComponent implements OnInit, OnDestroy {
  private readonly api = inject(CheckoutApi);

  readonly quoteId = input<string>('');
  /** `?session_id` — the Stripe Checkout Session we reconcile against. */
  readonly sessionId = input<string | undefined>('', { alias: 'session_id' });

  readonly money = money;
  readonly state = signal<PollState>('pending');
  readonly attempt = signal(1);

  readonly orderId = signal<string | null>(null);
  readonly orderNumber = signal<string | null>(null);
  readonly totalCents = signal(0);

  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    void this.poll();
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  retry(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.attempt.set(1);
    this.state.set('pending');
    void this.poll();
  }

  /**
   * Return-page reconciliation: confirms the order even if the webhook is
   * late. Polls with increasing backoff and gives up into the 'timeout' state
   * — the order is still safe server-side, only the confirmation UI is stuck.
   */
  private async poll(): Promise<void> {
    try {
      const result = await firstValueFrom(this.api.status(this.quoteId(), this.sessionId()));
      if (result.state === 'confirmed') {
        this.orderId.set(result.orderId);
        this.orderNumber.set(result.orderNumber);
        this.totalCents.set(result.totalCents);
        this.state.set('confirmed');
        return;
      }
    } catch {
      // Treat a transient failure the same as 'pending' — keep polling within
      // the bounded backoff rather than surfacing a scary error mid-payment.
    }

    const attemptIndex = this.attempt() - 1;
    if (attemptIndex >= POLL_DELAYS_MS.length) {
      this.state.set('timeout');
      return;
    }

    const delay = POLL_DELAYS_MS[attemptIndex];
    this.timers.push(
      setTimeout(() => {
        this.attempt.update((a) => a + 1);
        void this.poll();
      }, delay),
    );
  }
}
