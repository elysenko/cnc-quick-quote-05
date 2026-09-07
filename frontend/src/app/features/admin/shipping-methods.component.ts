import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ShippingKind, ShippingMethod } from '../../core/models';

@Component({
  selector: 'app-admin-shipping-methods',
  imports: [FormsModule, RouterLink],
  templateUrl: './shipping-methods.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingMethodsComponent {
  /** `?modal=shipping-method&id=…` — deep-linkable create/edit state. */
  readonly modal = input<string | undefined>();
  readonly id = input<string | undefined>();

  readonly methods = signal<ShippingMethod[]>([
    { id: 'shp_std', name: 'Standard freight', kind: 'flat', rate: 24.5, estDays: 5, isActive: true },
    { id: 'shp_exp', name: 'Express courier', kind: 'flat', rate: 58, estDays: 2, isActive: true },
    { id: 'shp_pal', name: 'Palletised (per sheet)', kind: 'per_sheet', rate: 18, estDays: 4, isActive: true },
    { id: 'shp_col', name: 'Collect from works', kind: 'flat', rate: 0, estDays: 1, isActive: true },
    { id: 'shp_ovn', name: 'Overnight priority', kind: 'flat', rate: 96, estDays: 1, isActive: false },
  ]);

  readonly modalOpen = computed(() => this.modal() === 'shipping-method');
  readonly editing = computed(() => this.methods().find((m) => m.id === this.id()) ?? null);
  readonly modalTitle = computed(() => (this.editing() ? 'Edit delivery method' : 'Add delivery method'));
  readonly activeCount = computed(() => this.methods().filter((m) => m.isActive).length);

  readonly draft = signal<ShippingMethod>(this.blank());

  private blank(): ShippingMethod {
    return { id: '', name: '', kind: 'flat', rate: 0, estDays: 3, isActive: true };
  }

  syncDraft(): void {
    this.draft.set(this.editing() ? { ...this.editing()! } : this.blank());
  }

  patch<K extends keyof ShippingMethod>(key: K, value: ShippingMethod[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  setKind(kind: ShippingKind): void {
    this.patch('kind', kind);
  }

  save(): void {
    const d = this.draft();
    if (d.id) {
      this.methods.update((list) => list.map((m) => (m.id === d.id ? { ...d } : m)));
    } else {
      this.methods.update((list) => [...list, { ...d, id: `shp_new${list.length}` }]);
    }
  }

  toggleActive(method: ShippingMethod): void {
    this.methods.update((list) =>
      list.map((m) => (m.id === method.id ? { ...m, isActive: !m.isActive } : m)),
    );
  }
}
