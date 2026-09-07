import { Injectable, computed, signal } from '@angular/core';
import { ShippingAddress, ShippingMethod } from '../../core/models';

/** Shared state across the checkout steps (review → shipping → payment). */
@Injectable({ providedIn: 'root' })
export class CheckoutStore {
  readonly shippingMethods = signal<ShippingMethod[]>([
    { id: 'shp_std', name: 'Standard freight', kind: 'flat', rate: 24.5, estDays: 5, isActive: true, resolvedCostCents: 2450 },
    { id: 'shp_exp', name: 'Express courier', kind: 'flat', rate: 58, estDays: 2, isActive: true, resolvedCostCents: 5800 },
    { id: 'shp_pal', name: 'Palletised (per sheet)', kind: 'per_sheet', rate: 18, estDays: 4, isActive: true, resolvedCostCents: 1800 },
    { id: 'shp_col', name: 'Collect from works', kind: 'flat', rate: 0, estDays: 1, isActive: true, resolvedCostCents: 0 },
  ]);

  readonly address = signal<ShippingAddress>({
    name: 'Dana Reyes',
    line1: '17 Harbour Works',
    line2: 'Unit 4',
    city: 'Milwaukee',
    region: 'WI',
    postcode: '53202',
    country: 'United States',
  });

  readonly selectedMethodId = signal<string>('shp_std');

  /** Preview toggle so the reviewer can see the blocking no-methods state. */
  readonly noActiveMethods = signal(false);

  readonly activeMethods = computed(() =>
    this.noActiveMethods() ? [] : this.shippingMethods().filter((m) => m.isActive),
  );

  readonly selectedMethod = computed(
    () => this.activeMethods().find((m) => m.id === this.selectedMethodId()) ?? null,
  );

  readonly shippingCostCents = computed(() => this.selectedMethod()?.resolvedCostCents ?? 0);

  select(id: string): void {
    this.selectedMethodId.set(id);
  }

  toggleNoMethods(): void {
    this.noActiveMethods.update((v) => !v);
  }
}
