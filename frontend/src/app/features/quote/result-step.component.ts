import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DraftStore } from '../../core/draft-store';
import { money, PriceBreakdown } from '../../core/models';
import { QuotesApi, QuoteDetail } from '../../core/api/quotes.service';
import { toAppError } from '../../core/errors';
import { PriceBreakdownComponent } from './components/price-breakdown.component';
import { WorkBedCanvasComponent } from './components/work-bed-canvas.component';

@Component({
  selector: 'app-result-step',
  imports: [PriceBreakdownComponent, WorkBedCanvasComponent],
  templateUrl: './result-step.component.html',
  styleUrl: './result-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultStepComponent {
  private readonly router = inject(Router);
  private readonly quotes = inject(QuotesApi);
  readonly draft = inject(DraftStore);

  readonly drawing = this.draft.drawing;
  readonly material = this.draft.material;
  readonly money = money;

  /** The saved quote. Null until the server has priced and stored it. */
  private readonly quote = signal<QuoteDetail | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * The authoritative breakdown is the one the server stored against the quote
   * (with its own frozen pricing snapshot). The local preview is only shown
   * while that round-trip is in flight, so the figure never flickers to blank.
   */
  readonly breakdown = computed<PriceBreakdown | null>(
    () => this.quote()?.breakdown ?? this.draft.breakdown(),
  );

  readonly nesting = computed(() => this.quote()?.nesting ?? this.draft.nesting());

  /** Reference of the saved quote, so the customer can cite it to the shop. */
  readonly reference = computed(() => this.quote()?.reference ?? '—');

  readonly unitPrice = computed(() => {
    const bd = this.breakdown();
    if (!bd) return 0;
    return Math.round(bd.totalCents / Math.max(1, this.draft.quantity()));
  });

  constructor() {
    void this.createQuote();
  }

  /**
   * Persists the quote the moment the customer reaches this step, so the price
   * they are shown is the one stored — and so "Proceed to checkout" has a real
   * quote id to navigate to.
   */
  private async createQuote(): Promise<void> {
    const dwg = this.drawing();
    const mat = this.material();
    if (!dwg || !mat) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await firstValueFrom(
        this.quotes.create({
          drawingId: dwg.id,
          materialId: mat.id,
          quantity: this.draft.quantity(),
        }),
      );
      this.quote.set(created);
      this.draft.stale.set(false);
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.saving.set(false);
    }
  }

  back(): void {
    void this.router.navigate(['/quotes/new/material']);
  }

  checkout(): void {
    const saved = this.quote();
    if (!saved) return;
    void this.router.navigate(['/checkout', saved.id, 'review']);
  }

  saveAndExit(): void {
    void this.router.navigate(['/quotes']);
  }
}
