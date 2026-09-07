import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DraftStore } from '../../core/draft-store';
import { money } from '../../core/models';
import { PriceBreakdownComponent } from './components/price-breakdown.component';
import { WorkBedCanvasComponent } from './components/work-bed-canvas.component';

@Component({
  selector: 'app-quote-detail',
  imports: [RouterLink, PriceBreakdownComponent, WorkBedCanvasComponent],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteDetailComponent {
  readonly draft = inject(DraftStore);

  /** `:id` and `?panel=breakdown` bind straight in as component inputs. */
  readonly id = input<string>('');
  readonly panel = input<string | undefined>();

  readonly money = money;
  readonly drawing = this.draft.drawing;
  readonly breakdown = this.draft.breakdown;
  readonly nesting = this.draft.nesting;
  readonly material = this.draft.material;

  readonly breakdownOpen = computed(() => this.panel() === 'breakdown');
  readonly reference = computed(() => `Q-2609-${this.id().replace(/\D/g, '').slice(-4) || '1348'}`);
}
