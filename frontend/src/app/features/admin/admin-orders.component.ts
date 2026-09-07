import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api/admin.service';
import { toAppError } from '../../core/errors';
import { Order, OrderStatus, money } from '../../core/models';

@Component({
  selector: 'app-admin-orders',
  imports: [RouterLink],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersComponent {
  private readonly api = inject(AdminApi);

  /** Bound from `?status` and `?page` by withComponentInputBinding. */
  readonly status = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly money = money;

  readonly statusFilters = [
    { value: 'all', label: 'All' },
    { value: 'paid', label: 'Paid' },
    { value: 'in_production', label: 'In production' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly visible = signal<Order[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly revenueCents = signal(0);

  readonly activeStatus = computed(() => this.status() ?? 'all');
  readonly currentPage = computed(() => Math.max(1, Number(this.page() ?? '1') || 1));

  constructor() {
    // Re-fetch from the server whenever the status/page query params change.
    effect(() => {
      const status = this.activeStatus();
      const page = this.currentPage();
      void this.load(status, page);
    });
  }

  private async load(status: string, page: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.api.orders({ status, page }));
      this.visible.set(result.items);
      this.total.set(result.total);
      this.totalPages.set(result.totalPages);
      this.revenueCents.set(result.revenueCents ?? 0);
    } catch (err) {
      this.visible.set([]);
      this.total.set(0);
      this.totalPages.set(1);
      this.revenueCents.set(0);
      this.error.set(toAppError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

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
