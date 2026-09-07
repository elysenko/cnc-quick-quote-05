import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DraftStore } from '../../core/draft-store';
import { money } from '../../core/models';

@Component({
  selector: 'app-review-step',
  imports: [RouterLink],
  templateUrl: './review-step.component.html',
  styleUrl: './checkout-steps.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewStepComponent {
  readonly draft = inject(DraftStore);

  readonly quoteId = input<string>('');
  /** `?status=cancelled` — Stripe returned the customer without charging. */
  readonly status = input<string | undefined>();

  readonly money = money;
  readonly cancelled = computed(() => this.status() === 'cancelled');
  readonly drawing = this.draft.drawing;
  readonly material = this.draft.material;
  readonly breakdown = this.draft.breakdown;
  readonly nesting = this.draft.nesting;
}
