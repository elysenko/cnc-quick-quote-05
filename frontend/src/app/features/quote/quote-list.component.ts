import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { QuotesApi } from '../../core/api/quotes.service';
import { Quote, QuoteStatus, money } from '../../core/models';

@Component({
  selector: 'app-quote-list',
  imports: [RouterLink],
  templateUrl: './quote-list.component.html',
  styleUrl: './quote-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteListComponent {
  private readonly quotesApi = inject(QuotesApi);

  /** Bound from `?status`, `?page` and `?sort` by withComponentInputBinding. */
  readonly status = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly sort = input<string | undefined>();

  readonly money = money;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly quotes = signal<Quote[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);

  readonly statusFilters: Array<{ value: string; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'ordered', label: 'Ordered' },
    { value: 'expired', label: 'Expired' },
  ];

  readonly activeStatus = computed(() => this.status() ?? 'all');
  readonly activeSort = computed(() => this.sort() ?? 'newest');
  readonly currentPage = computed(() => Math.max(1, Number(this.page() ?? '1') || 1));

  readonly visible = this.quotes;
  readonly resultCount = this.total;

  constructor() {
    // Re-fetch from the server whenever the status/sort/page query params change.
    effect(() => {
      const status = this.activeStatus();
      const sort = this.activeSort();
      const page = this.currentPage();
      void this.load(status, sort, page);
    });
  }

  private async load(status: string, sort: string, page: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.quotesApi.list({ status, sort, page }));
      this.quotes.set(result.items);
      this.total.set(result.total);
      this.totalPages.set(result.totalPages);
    } catch {
      this.quotes.set([]);
      this.total.set(0);
      this.totalPages.set(1);
      this.error.set('We could not load your quotes. Refresh to try again.');
    } finally {
      this.loading.set(false);
    }
  }

  badgeClass(status: QuoteStatus): string {
    if (status === 'ordered') return 'badge badge-ok';
    if (status === 'expired') return 'badge';
    return 'badge badge-info';
  }

  queryFor(patch: Record<string, string>): Record<string, string> {
    return { status: this.activeStatus(), sort: this.activeSort(), page: String(this.currentPage()), ...patch };
  }
}
