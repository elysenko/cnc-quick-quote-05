import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { QuoteDetail, QuotesApi } from '../../core/api/quotes.service';
import { QuoteStatus, money } from '../../core/models';
import { PriceBreakdownComponent } from './components/price-breakdown.component';
import { WorkBedCanvasComponent } from './components/work-bed-canvas.component';

@Component({
  selector: 'app-quote-detail',
  imports: [RouterLink, DatePipe, PriceBreakdownComponent, WorkBedCanvasComponent],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteDetailComponent {
  private readonly quotesApi = inject(QuotesApi);

  /** `:id` and `?panel=breakdown` bind straight in as component inputs. */
  readonly id = input<string>('');
  readonly panel = input<string | undefined>();

  readonly money = money;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly quote = signal<QuoteDetail | null>(null);

  readonly drawing = computed(() => this.quote()?.drawing ?? null);
  readonly material = computed(() => this.quote()?.material ?? null);
  readonly nesting = computed(() => this.quote()?.nesting ?? null);
  readonly breakdown = computed(() => this.quote()?.breakdown ?? null);

  readonly breakdownOpen = computed(() => this.panel() === 'breakdown');
  readonly reference = computed(() => this.quote()?.reference ?? '');

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
      const quote = await firstValueFrom(this.quotesApi.get(id));
      this.quote.set(quote);
    } catch {
      this.quote.set(null);
      this.error.set('We could not load this quote. Refresh to try again.');
    } finally {
      this.loading.set(false);
    }
  }

  badgeClass(status: QuoteStatus): string {
    if (status === 'ordered') return 'badge badge-ok';
    if (status === 'expired') return 'badge';
    return 'badge badge-info';
  }
}
