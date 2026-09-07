import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OrdersApi } from '../../core/api/orders.service';
import { Order, OrderStatus, money } from '../../core/models';

@Component({
  selector: 'app-order-list',
  imports: [RouterLink],
  templateUrl: './order-list.component.html',
  styleUrl: './orders.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderListComponent {
  private readonly ordersApi = inject(OrdersApi);

  readonly page = input<string | undefined>();
  readonly money = money;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly orders = signal<Order[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);

  readonly currentPage = computed(() => Math.max(1, Number(this.page() ?? '1') || 1));
  readonly visible = this.orders;

  constructor() {
    // Re-fetch from the server whenever the page query param changes.
    effect(() => {
      const page = this.currentPage();
      void this.load(page);
    });
  }

  private async load(page: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.ordersApi.list(page));
      this.orders.set(result.items);
      this.total.set(result.total);
      this.totalPages.set(result.totalPages);
    } catch {
      this.orders.set([]);
      this.total.set(0);
      this.totalPages.set(1);
      this.error.set('We could not load your orders. Refresh to try again.');
    } finally {
      this.loading.set(false);
    }
  }

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
