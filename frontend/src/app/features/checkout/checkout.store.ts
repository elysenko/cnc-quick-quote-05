import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ShippingMethod } from '../../core/models';
import { CheckoutApi, CheckoutSummary } from '../../core/api/checkout.service';
import { toAppError } from '../../core/errors';

/**
 * Shared state across the checkout steps (review → shipping → payment).
 *
 * A thin per-quote cache in front of `CheckoutApi`: each step calls
 * `loadSummary`/`loadShippingMethods` in `ngOnInit`, and the store only hits
 * the network again if the quote id actually changed, so navigating back and
 * forth between review and shipping doesn't re-fetch on every visit.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutStore {
  private readonly api = inject(CheckoutApi);

  readonly summary = signal<CheckoutSummary | null>(null);
  readonly summaryLoading = signal(false);
  readonly summaryError = signal<string | null>(null);

  readonly methods = signal<ShippingMethod[]>([]);
  readonly methodsLoading = signal(false);
  readonly methodsError = signal<string | null>(null);
  /** True on a 409 from the server — the shop has no active delivery method. */
  readonly methodsBlocked = signal(false);

  readonly selectedMethodId = signal<string | null>(null);

  readonly selectedMethod = computed(
    () => this.methods().find((m) => m.id === this.selectedMethodId()) ?? null,
  );

  readonly shippingCostCents = computed(() => this.selectedMethod()?.resolvedCostCents ?? 0);

  private summaryQuoteId: string | null = null;
  private summaryPromise: Promise<void> | null = null;
  private methodsQuoteId: string | null = null;
  private methodsPromise: Promise<void> | null = null;

  loadSummary(quoteId: string): Promise<void> {
    if (this.summaryQuoteId === quoteId && this.summaryPromise) return this.summaryPromise;
    this.summaryQuoteId = quoteId;
    this.summaryLoading.set(true);
    this.summaryError.set(null);
    this.summaryPromise = (async () => {
      try {
        this.summary.set(await firstValueFrom(this.api.summary(quoteId)));
      } catch (err) {
        this.summaryError.set(toAppError(err).message);
        this.summaryQuoteId = null; // allow a retry
      } finally {
        this.summaryLoading.set(false);
      }
    })();
    return this.summaryPromise;
  }

  loadShippingMethods(quoteId: string): Promise<void> {
    if (this.methodsQuoteId === quoteId && this.methodsPromise) return this.methodsPromise;
    this.methodsQuoteId = quoteId;
    this.methodsLoading.set(true);
    this.methodsError.set(null);
    this.methodsPromise = (async () => {
      try {
        const methods = await firstValueFrom(this.api.shippingMethods(quoteId));
        this.methods.set(methods);
        this.methodsBlocked.set(false);
        if (!this.selectedMethodId() || !methods.some((m) => m.id === this.selectedMethodId())) {
          this.selectedMethodId.set(methods[0]?.id ?? null);
        }
      } catch (err) {
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.methods.set([]);
          this.methodsBlocked.set(true);
        } else {
          this.methodsError.set(toAppError(err).message);
          this.methodsQuoteId = null; // allow a retry
        }
      } finally {
        this.methodsLoading.set(false);
      }
    })();
    return this.methodsPromise;
  }

  select(id: string): void {
    this.selectedMethodId.set(id);
  }

  /** Creates the Stripe Checkout Session the pay button redirects to. */
  createSession(quoteId: string, shippingMethodId: string): Promise<{ url: string; sessionId: string }> {
    return firstValueFrom(this.api.createSession(quoteId, shippingMethodId));
  }
}
