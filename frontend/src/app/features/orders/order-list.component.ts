import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Order, OrderStatus, money } from '../../core/models';

const PAGE_SIZE = 5;

@Component({
  selector: 'app-order-list',
  imports: [RouterLink],
  templateUrl: './order-list.component.html',
  styleUrl: './orders.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListComponent {
  readonly page = input<string | undefined>();
  readonly money = money;

  readonly orders = signal<Order[]>([
    { id: 'ord_9f21', orderNumber: 'NGL-2026-004182', confirmationNumber: 'CNF-8H2K-4QT9', quoteId: 'qte_2418', customerEmail: 'demo.customer@example.com', materialName: 'Mild Steel 1.6 mm', quantity: 24, shippingMethodName: 'Standard freight', shippingCostCents: 2450, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', line2: 'Unit 4', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'United States' }, subtotalCents: 41255, totalCents: 43705, status: 'paid', estimatedDelivery: '12 September 2026', emailSentAt: '2026-09-05T14:31:00.000Z', createdAt: '2026-09-05T14:30:00.000Z' },
    { id: 'ord_9e04', orderNumber: 'NGL-2026-004119', confirmationNumber: 'CNF-2W7P-1LX4', quoteId: 'qte_2402', customerEmail: 'demo.customer@example.com', materialName: 'Mild Steel 3.0 mm', quantity: 60, shippingMethodName: 'Palletised (per sheet)', shippingCostCents: 3600, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'United States' }, subtotalCents: 78940, totalCents: 82540, status: 'in_production', estimatedDelivery: '9 September 2026', emailSentAt: '2026-08-28T09:14:00.000Z', createdAt: '2026-08-28T09:13:00.000Z' },
    { id: 'ord_9c77', orderNumber: 'NGL-2026-003980', confirmationNumber: 'CNF-6J3D-8ZR2', quoteId: 'qte_2350', customerEmail: 'demo.customer@example.com', materialName: 'Stainless 304 2.0 mm', quantity: 150, shippingMethodName: 'Express courier', shippingCostCents: 5800, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'United States' }, subtotalCents: 213500, totalCents: 219300, status: 'shipped', estimatedDelivery: '2 August 2026', emailSentAt: '2026-07-30T11:52:00.000Z', createdAt: '2026-07-30T11:50:00.000Z' },
    { id: 'ord_9a12', orderNumber: 'NGL-2026-003844', confirmationNumber: 'CNF-4T9M-3VB7', quoteId: 'qte_2290', customerEmail: 'demo.customer@example.com', materialName: 'Brass C260 1.5 mm', quantity: 30, shippingMethodName: 'Collect from works', shippingCostCents: 0, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'United States' }, subtotalCents: 128760, totalCents: 128760, status: 'shipped', estimatedDelivery: '28 June 2026', emailSentAt: null, createdAt: '2026-06-25T13:40:00.000Z' },
    { id: 'ord_98d5', orderNumber: 'NGL-2026-003701', confirmationNumber: 'CNF-9K1Q-6WY5', quoteId: 'qte_2261', customerEmail: 'demo.customer@example.com', materialName: 'Mild Steel 3.0 mm', quantity: 200, shippingMethodName: 'Standard freight', shippingCostCents: 2450, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'United States' }, subtotalCents: 96300, totalCents: 98750, status: 'shipped', estimatedDelivery: '15 June 2026', emailSentAt: '2026-06-09T10:09:00.000Z', createdAt: '2026-06-09T10:08:00.000Z' },
    { id: 'ord_9711', orderNumber: 'NGL-2026-003588', confirmationNumber: 'CNF-5R8N-2HC1', quoteId: 'qte_2199', customerEmail: 'demo.customer@example.com', materialName: 'Aluminium 5052 3.0 mm', quantity: 18, shippingMethodName: 'Express courier', shippingCostCents: 5800, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'United States' }, subtotalCents: 52400, totalCents: 58200, status: 'cancelled', estimatedDelivery: '—', emailSentAt: '2026-05-18T15:22:00.000Z', createdAt: '2026-05-18T15:20:00.000Z' },
  ]);

  readonly currentPage = computed(() => Math.max(1, Number(this.page() ?? '1') || 1));
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.orders().length / PAGE_SIZE)));
  readonly visible = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.orders().slice(start, start + PAGE_SIZE);
  });

  label(status: OrderStatus): string {
    return status === 'in_production' ? 'in production' : status;
  }

  badgeClass(status: OrderStatus): string {
    if (status === 'shipped') return 'badge badge-ok';
    if (status === 'in_production') return 'badge badge-warn';
    if (status === 'cancelled') return 'badge badge-danger';
    return 'badge badge-info';
  }
}
