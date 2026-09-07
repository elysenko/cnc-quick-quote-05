import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../api-base';
import { Order } from '../models';

export interface OrderListPage {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  revenueCents?: number;
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  list(page = 1): Observable<OrderListPage> {
    return this.http.get<OrderListPage>(apiUrl('/orders'), {
      params: new HttpParams().set('page', String(page)),
    });
  }

  get(id: string): Observable<Order> {
    return this.http.get<Order>(apiUrl(`/orders/${id}`));
  }

  /** Absolute path so the anchor downloads through the same nginx proxy. */
  receiptUrl(id: string): string {
    return apiUrl(`/orders/${id}/receipt`);
  }
}
