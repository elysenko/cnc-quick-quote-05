import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../api-base';
import {
  BusinessConfig,
  MachineConfig,
  Material,
  PricingConfig,
  SettingEntry,
  ShippingMethod,
} from '../models';
import { OrderListPage } from './orders.service';

export interface BusinessSaveResult {
  config: BusinessConfig;
  /** Present only when a new Stripe secret key was submitted and probed. */
  probe: { ok: boolean; message: string } | null;
}

/** Write-only Stripe fields; blank leaves the stored secret untouched. */
export interface BusinessUpdate extends Partial<Omit<BusinessConfig, 'logoUrl'>> {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  // Materials — deactivation only; a material is never hard-deleted because
  // historical quotes reference the material they were priced against.
  materials(): Observable<Material[]> {
    return this.http.get<Material[]>(apiUrl('/admin/materials'));
  }

  createMaterial(input: Omit<Material, 'id'>): Observable<Material> {
    return this.http.post<Material>(apiUrl('/admin/materials'), input);
  }

  updateMaterial(id: string, patch: Partial<Omit<Material, 'id'>>): Observable<Material> {
    return this.http.patch<Material>(apiUrl(`/admin/materials/${id}`), patch);
  }

  // Pricing / machine
  pricing(): Observable<PricingConfig> {
    return this.http.get<PricingConfig>(apiUrl('/admin/pricing'));
  }

  savePricing(config: PricingConfig): Observable<PricingConfig> {
    return this.http.put<PricingConfig>(apiUrl('/admin/pricing'), config);
  }

  machine(): Observable<MachineConfig> {
    return this.http.get<MachineConfig>(apiUrl('/admin/machine'));
  }

  saveMachine(config: MachineConfig): Observable<MachineConfig> {
    return this.http.put<MachineConfig>(apiUrl('/admin/machine'), config);
  }

  // Business / branding / payments
  business(): Observable<BusinessConfig> {
    return this.http.get<BusinessConfig>(apiUrl('/admin/business'));
  }

  saveBusiness(patch: BusinessUpdate): Observable<BusinessSaveResult> {
    return this.http.put<BusinessSaveResult>(apiUrl('/admin/business'), patch);
  }

  uploadLogo(file: File): Observable<BusinessConfig> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<BusinessConfig>(apiUrl('/admin/business/logo'), form);
  }

  // Shipping methods
  shippingMethods(): Observable<ShippingMethod[]> {
    return this.http.get<ShippingMethod[]>(apiUrl('/admin/shipping-methods'));
  }

  createShippingMethod(input: Omit<ShippingMethod, 'id' | 'resolvedCostCents'>): Observable<ShippingMethod> {
    return this.http.post<ShippingMethod>(apiUrl('/admin/shipping-methods'), input);
  }

  updateShippingMethod(
    id: string,
    patch: Partial<Omit<ShippingMethod, 'id' | 'resolvedCostCents'>>,
  ): Observable<ShippingMethod> {
    return this.http.patch<ShippingMethod>(apiUrl(`/admin/shipping-methods/${id}`), patch);
  }

  // Orders
  orders(filters: { status?: string; page?: number }): Observable<OrderListPage> {
    let params = new HttpParams();
    if (filters.status && filters.status !== 'all') params = params.set('status', filters.status);
    if (filters.page) params = params.set('page', String(filters.page));
    return this.http.get<OrderListPage>(apiUrl('/admin/orders'), { params });
  }

  // Service + integration credentials. Values come back masked, always.
  settings(): Observable<SettingEntry[]> {
    return this.http.get<SettingEntry[]>(apiUrl('/admin/settings'));
  }

  saveSettings(entries: Array<{ key: string; value: string }>): Observable<SettingEntry[]> {
    return this.http.patch<SettingEntry[]>(apiUrl('/admin/settings'), { entries });
  }
}
