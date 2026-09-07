import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Order, OrderStatus, money } from '../../core/models';

const PAGE_SIZE = 6;

@Component({
  selector: 'app-admin-orders',
  imports: [RouterLink],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersComponent {
  readonly status = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly money = money;

  readonly orders = signal<Order[]>([
    { id: 'ord_9f21', orderNumber: 'NGL-2026-004182', confirmationNumber: 'CNF-8H2K-4QT9', quoteId: 'qte_2418', customerEmail: 'demo.customer@example.com', materialName: 'Mild Steel 1.6 mm', quantity: 24, shippingMethodName: 'Standard freight', shippingCostCents: 2450, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'US' }, subtotalCents: 41255, totalCents: 43705, status: 'paid', estimatedDelivery: '12 Sep 2026', emailSentAt: '2026-09-05T14:31:00.000Z', createdAt: '2026-09-05T14:30:00.000Z' },
    { id: 'ord_9e04', orderNumber: 'NGL-2026-004119', confirmationNumber: 'CNF-2W7P-1LX4', quoteId: 'qte_2402', customerEmail: 'marcus.hale@fabworks.example', materialName: 'Mild Steel 3.0 mm', quantity: 60, shippingMethodName: 'Palletised', shippingCostCents: 3600, shippingAddress: { name: 'Marcus Hale', line1: '9 Ironside Rd', city: 'Racine', region: 'WI', postcode: '53403', country: 'US' }, subtotalCents: 78940, totalCents: 82540, status: 'in_production', estimatedDelivery: '9 Sep 2026', emailSentAt: '2026-08-28T09:14:00.000Z', createdAt: '2026-08-28T09:13:00.000Z' },
    { id: 'ord_9c77', orderNumber: 'NGL-2026-003980', confirmationNumber: 'CNF-6J3D-8ZR2', quoteId: 'qte_2350', customerEmail: 'ops@ridgelinemfg.example', materialName: 'Stainless 304 2.0 mm', quantity: 150, shippingMethodName: 'Express courier', shippingCostCents: 5800, shippingAddress: { name: 'Ridgeline Mfg', line1: '400 Kiln St', city: 'Madison', region: 'WI', postcode: '53703', country: 'US' }, subtotalCents: 213500, totalCents: 219300, status: 'shipped', estimatedDelivery: '2 Aug 2026', emailSentAt: '2026-07-30T11:52:00.000Z', createdAt: '2026-07-30T11:50:00.000Z' },
    { id: 'ord_9a12', orderNumber: 'NGL-2026-003844', confirmationNumber: 'CNF-4T9M-3VB7', quoteId: 'qte_2290', customerEmail: 'j.okafor@brasslight.example', materialName: 'Brass C260 1.5 mm', quantity: 30, shippingMethodName: 'Collect from works', shippingCostCents: 0, shippingAddress: { name: 'Joy Okafor', line1: '12 Lantern Way', city: 'Kenosha', region: 'WI', postcode: '53140', country: 'US' }, subtotalCents: 128760, totalCents: 128760, status: 'shipped', estimatedDelivery: '28 Jun 2026', emailSentAt: null, createdAt: '2026-06-25T13:40:00.000Z' },
    { id: 'ord_98d5', orderNumber: 'NGL-2026-003701', confirmationNumber: 'CNF-9K1Q-6WY5', quoteId: 'qte_2261', customerEmail: 'buying@northpeak.example', materialName: 'Mild Steel 3.0 mm', quantity: 200, shippingMethodName: 'Standard freight', shippingCostCents: 2450, shippingAddress: { name: 'Northpeak', line1: '88 Quarry Ave', city: 'Green Bay', region: 'WI', postcode: '54303', country: 'US' }, subtotalCents: 96300, totalCents: 98750, status: 'shipped', estimatedDelivery: '15 Jun 2026', emailSentAt: '2026-06-09T10:09:00.000Z', createdAt: '2026-06-09T10:08:00.000Z' },
    { id: 'ord_9711', orderNumber: 'NGL-2026-003588', confirmationNumber: 'CNF-5R8N-2HC1', quoteId: 'qte_2199', customerEmail: 'sam.pike@altair.example', materialName: 'Aluminium 5052 3.0 mm', quantity: 18, shippingMethodName: 'Express courier', shippingCostCents: 5800, shippingAddress: { name: 'Sam Pike', line1: '3 Foundry Ln', city: 'Appleton', region: 'WI', postcode: '54911', country: 'US' }, subtotalCents: 52400, totalCents: 58200, status: 'cancelled', estimatedDelivery: '—', emailSentAt: '2026-05-18T15:22:00.000Z', createdAt: '2026-05-18T15:20:00.000Z' },
    { id: 'ord_9600', orderNumber: 'NGL-2026-003455', confirmationNumber: 'CNF-1B4V-7GD3', quoteId: 'qte_2140', customerEmail: 'workshop@delta-eng.example', materialName: 'Mild Steel 1.6 mm', quantity: 45, shippingMethodName: 'Standard freight', shippingCostCents: 2450, shippingAddress: { name: 'Delta Eng', line1: '210 Anvil Ct', city: 'Waukesha', region: 'WI', postcode: '53186', country: 'US' }, subtotalCents: 61200, totalCents: 63650, status: 'paid', estimatedDelivery: '24 Apr 2026', emailSentAt: '2026-04-17T08:41:00.000Z', createdAt: '2026-04-17T08:40:00.000Z' },
  ]);

  readonly statusFilters = [
    { value: 'all', label: 'All' },
    { value: 'paid', label: 'Paid' },
    { value: 'in_production', label: 'In production' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  readonly activeStatus = computed(() => this.status() ?? 'all');
  readonly currentPage = computed(() => Math.max(1, Number(this.page() ?? '1') || 1));

  private readonly filtered = computed(() =>
    this.activeStatus() === 'all'
      ? this.orders()
      : this.orders().filter((o) => o.status === this.activeStatus()),
  );

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  readonly visible = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  readonly revenueCents = computed(() =>
    this.filtered().filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.totalCents, 0),
  );

  label(status: OrderStatus): string {
    return status === 'in_production' ? 'In production' : status.charAt(0).toUpperCase() + status.slice(1);
  }

  badgeClass(status: OrderStatus): string {
    if (status === 'shipped') return 'badge badge-ok';
    if (status === 'in_production') return 'badge badge-warn';
    if (status === 'cancelled') return 'badge badge-danger';
    return 'badge badge-info';
  }
}
