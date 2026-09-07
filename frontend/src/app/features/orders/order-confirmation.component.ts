import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandingService } from '../../core/branding.service';
import { Order, money } from '../../core/models';

@Component({
  selector: 'app-order-confirmation',
  imports: [RouterLink],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './orders.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderConfirmationComponent {
  readonly branding = inject(BrandingService);
  readonly id = input<string>('');
  readonly money = money;

  readonly orders = signal<Order[]>([
    { id: 'ord_9f21', orderNumber: 'NGL-2026-004182', confirmationNumber: 'CNF-8H2K-4QT9', quoteId: 'qte_2418', customerEmail: 'demo.customer@example.com', materialName: 'Mild Steel 1.6 mm', quantity: 24, shippingMethodName: 'Standard freight', shippingCostCents: 2450, shippingAddress: { name: 'Dana Reyes', line1: '17 Harbour Works', line2: 'Unit 4', city: 'Milwaukee', region: 'WI', postcode: '53202', country: 'United States' }, subtotalCents: 41255, totalCents: 43705, status: 'paid', estimatedDelivery: '12 September 2026', emailSentAt: '2026-09-05T14:31:00.000Z', createdAt: '2026-09-05T14:30:00.000Z' },
  ]);

  readonly order = computed(() => this.orders().find((o) => o.id === this.id()) ?? this.orders()[0]);

  /** Preview toggle: the success view must read correctly even when the email failed. */
  readonly emailFailed = signal(false);

  toggleEmailState(): void {
    this.emailFailed.update((v) => !v);
  }
}
