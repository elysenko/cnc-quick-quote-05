import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../api-base';
import { MachineConfig, Material, PricingConfig } from '../models';

/**
 * Read-only reference data the quote wizard needs: what the shop stocks, the
 * machine's limits, and the current rates (for the live preview only — the
 * authoritative price is the snapshot the server stores on the quote).
 */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);

  materials(): Observable<Material[]> {
    return this.http.get<Material[]>(apiUrl('/materials'));
  }

  machineConfig(): Observable<MachineConfig> {
    return this.http.get<MachineConfig>(apiUrl('/config/machine'));
  }

  pricingConfig(): Observable<PricingConfig> {
    return this.http.get<PricingConfig>(apiUrl('/config/pricing'));
  }
}
