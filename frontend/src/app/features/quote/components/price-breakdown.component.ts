import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PriceBreakdown, money } from '../../../core/models';

@Component({
  selector: 'app-price-breakdown',
  templateUrl: './price-breakdown.component.html',
  styleUrl: './price-breakdown.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceBreakdownComponent {
  readonly breakdown = input.required<PriceBreakdown>();
  readonly heading = input('Price breakdown');
  readonly money = money;
}
