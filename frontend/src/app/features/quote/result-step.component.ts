import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DraftStore } from '../../core/draft-store';
import { money } from '../../core/models';
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
  readonly draft = inject(DraftStore);

  readonly drawing = this.draft.drawing;
  readonly breakdown = this.draft.breakdown;
  readonly nesting = this.draft.nesting;
  readonly material = this.draft.material;
  readonly money = money;

  /** Reference the saved quote will carry — shown so the customer can cite it. */
  readonly reference = computed(() => `Q-2609-${(this.draft.quantity() * 7 + 1180).toString().padStart(4, '0')}`);

  readonly unitPrice = computed(() => {
    const bd = this.breakdown();
    if (!bd) return 0;
    return Math.round(bd.totalCents / Math.max(1, this.draft.quantity()));
  });

  back(): void {
    void this.router.navigate(['/quotes/new/material']);
  }

  checkout(): void {
    void this.router.navigate(['/checkout', 'qte_2418', 'review']);
  }

  saveAndExit(): void {
    void this.router.navigate(['/quotes']);
  }
}
