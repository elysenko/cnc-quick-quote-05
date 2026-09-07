import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BrandingService } from '../../core/branding.service';
import { Order, money } from '../../core/models';

@Component({
  selector: 'app-order-detail',
  imports: [RouterLink, DatePipe],
  templateUrl: './order-detail.component.html',
  styleUrl: './orders.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailComponent {
  readonly branding = inject(BrandingService);
  readonly id = input<string>('');
  readonly money = money;

  readonly orders = signal<Order[]>([
    { id: 'ord_9f21', orderNumber: 'NGL-2026-004182', confirmationNumber: 'CNF-8H2K-4QT9', quoteId: 'qte_2418', customerEmail: 'demo.customer@example.com', materialName: 'Mild Steel 1.6 mm', quantity: 24, shippingMethodName: 'Standard freight', shippingCostCents: 2450, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', line2: 'Unit 4', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'United States' }, subtotalCents: 41255, totalCents: 43705, status: 'paid', estimatedDelivery: '12 September 2026', emailSentAt: '2026-09-05T14:31:00.000Z', createdAt: '2026-09-05T14:30:00.000Z' },
    { id: 'ord_9e04', orderNumber: 'NGL-2026-004119', confirmationNumber: 'CNF-2W7P-1LX4', quoteId: 'qte_2402', customerEmail: 'demo.customer@example.com', materialName: 'Mild Steel 3.0 mm', quantity: 60, shippingMethodName: 'Palletised (per sheet)', shippingCostCents: 3600, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'United States' }, subtotalCents: 78940, totalCents: 82540, status: 'in_production', estimatedDelivery: '9 September 2026', emailSentAt: '2026-08-28T09:14:00.000Z', createdAt: '2026-08-28T09:13:00.000Z' },
  ]);

  readonly order = computed(() => this.orders().find((o) => o.id === this.id()) ?? this.orders()[0]);

  readonly statusLabel = computed(() => {
    const s = this.order().status;
    return s === 'in_production' ? 'In production' : s.charAt(0).toUpperCase() + s.slice(1);
  });
}
