import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../api-base';
import { Drawing, Material, NestResult, PriceBreakdown, Quote } from '../models';

export interface QuoteDetail extends Quote {
  drawing: Drawing;
  material: Material;
  nesting: NestResult;
  breakdown: PriceBreakdown;
  pricingSnapshot: Record<string, number>;
}

export interface QuoteListPage {
  items: Quote[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class QuotesApi {
  private readonly http = inject(HttpClient);

  create(input: { drawingId: string; materialId: string; quantity: number }): Observable<QuoteDetail> {
    return this.http.post<QuoteDetail>(apiUrl('/quotes'), input);
  }

  list(filters: { status?: string; sort?: string; page?: number }): Observable<QuoteListPage> {
    let params = new HttpParams();
    if (filters.status && filters.status !== 'all') params = params.set('status', filters.status);
    if (filters.sort) params = params.set('sort', filters.sort);
    if (filters.page) params = params.set('page', String(filters.page));
    return this.http.get<QuoteListPage>(apiUrl('/quotes'), { params });
  }

  get(id: string): Observable<QuoteDetail> {
    return this.http.get<QuoteDetail>(apiUrl(`/quotes/${id}`));
  }
}
