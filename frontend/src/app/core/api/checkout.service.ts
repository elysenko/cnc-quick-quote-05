import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../api-base';
import { ShippingMethod } from '../models';

export interface CheckoutSummary {
  quoteId: string;
  reference: string;
  materialName: string;
  quantity: number;
  sheetCount: number;
  partsCents: number;
  status: 'draft' | 'ordered' | 'expired';
  orderId: string | null;
}

export interface CheckoutStatus {
  state: 'pending' | 'confirmed';
  orderId: string | null;
  orderNumber: string | null;
  totalCents: number;
}

@Injectable({ providedIn: 'root' })
export class CheckoutApi {
  private readonly http = inject(HttpClient);

  summary(quoteId: string): Observable<CheckoutSummary> {
    return this.http.get<CheckoutSummary>(apiUrl(`/checkout/${quoteId}`));
  }

  /**
   * Active shipping methods priced for this quote. Fails with 409 when the shop
   * has none active — the caller renders the blocking contact message rather
   * than letting an unpriced order through.
   */
  shippingMethods(quoteId: string): Observable<ShippingMethod[]> {
    return this.http.get<ShippingMethod[]>(apiUrl(`/checkout/${quoteId}/shipping-methods`));
  }

  createSession(quoteId: string, shippingMethodId: string): Observable<{ url: string; sessionId: string }> {
    return this.http.post<{ url: string; sessionId: string }>(
      apiUrl(`/checkout/${quoteId}/session`),
      { shippingMethodId },
    );
  }

  /** Return-page reconciliation: confirms the order even if the webhook is late. */
  status(quoteId: string, sessionId?: string): Observable<CheckoutStatus> {
    let params = new HttpParams();
    if (sessionId) params = params.set('session_id', sessionId);
    return this.http.get<CheckoutStatus>(apiUrl(`/checkout/${quoteId}/status`), { params });
  }
}
