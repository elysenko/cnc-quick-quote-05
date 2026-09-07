import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BrandingService } from '../../core/branding.service';
import { OrdersApi } from '../../core/api/orders.service';
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
  private readonly ordersApi = inject(OrdersApi);

  readonly id = input<string>('');
  readonly money = money;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly order = signal<Order | null>(null);

  readonly receiptHref = computed(() => this.ordersApi.receiptUrl(this.id()));

  readonly statusLabel = computed(() => {
    const s = this.order()?.status;
    if (!s) return '';
    return s === 'in_production' ? 'In production' : s.charAt(0).toUpperCase() + s.slice(1);
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (!id) return;
      void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const order = await firstValueFrom(this.ordersApi.get(id));
      this.order.set(order);
    } catch {
      this.order.set(null);
      this.error.set('We could not load this order. Refresh to try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
