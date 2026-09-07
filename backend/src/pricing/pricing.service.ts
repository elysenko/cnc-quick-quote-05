import { Injectable } from '@nestjs/common';

const MM_PER_FOOT = 304.8;

export interface PricingSnapshot {
  setupFee: number;
  costPerLinearFoot: number;
  perSheetCost: number;
  handlingFee: number;
  costPerBend: number;
  minimumOrder: number;
}

export interface PriceInput {
  cutLengthMmTotal: number;
  bendCountTotal: number;
  sheetCount: number;
  materialMultiplier: number;
  config: PricingSnapshot;
}

export interface BreakdownLine {
  key: string;
  label: string;
  detail: string;
  amountCents: number;
}

export interface PriceBreakdown {
  lines: BreakdownLine[];
  subtotalCents: number;
  totalCents: number;
  minimumApplied: boolean;
}

const cents = (dollars: number): number => Math.round(dollars * 100);

/**
 * Pure pricing pass over a frozen config snapshot.
 *
 * The material `costMultiplier` applies to SHEET COST ONLY — the material is
 * the sheet. Cutting labour is charged per linear foot regardless of alloy, so
 * multiplying it too would double-count the material premium.
 *
 * Every amount is integer cents; the minimum-order clamp is applied last and
 * reported through `minimumApplied` so the UI can explain the price.
 */
@Injectable()
export class PricingService {
  price(input: PriceInput): PriceBreakdown {
    const { cutLengthMmTotal, bendCountTotal, sheetCount, materialMultiplier, config } = input;
    const cutFt = cutLengthMmTotal / MM_PER_FOOT;

    const lines: BreakdownLine[] = [
      {
        key: 'setup',
        label: 'Setup fee',
        detail: 'One-off machine setup',
        amountCents: cents(config.setupFee),
      },
      {
        key: 'cutting',
        label: 'Cutting',
        detail: `${cutFt.toFixed(1)} linear ft @ $${config.costPerLinearFoot.toFixed(2)}/ft`,
        amountCents: cents(cutFt * config.costPerLinearFoot),
      },
      {
        key: 'sheets',
        label: 'Material',
        detail: `${sheetCount} sheet${sheetCount === 1 ? '' : 's'} @ $${config.perSheetCost.toFixed(2)} × ${materialMultiplier.toFixed(2)}`,
        amountCents: cents(sheetCount * config.perSheetCost * materialMultiplier),
      },
      {
        key: 'handling',
        label: 'Handling',
        detail: 'Packing and inspection',
        amountCents: cents(config.handlingFee),
      },
      {
        key: 'bends',
        label: 'Bending',
        detail: `${bendCountTotal} bend${bendCountTotal === 1 ? '' : 's'} @ $${config.costPerBend.toFixed(2)}`,
        amountCents: cents(bendCountTotal * config.costPerBend),
      },
    ];

    const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
    const minimumCents = cents(config.minimumOrder);
    const minimumApplied = subtotalCents < minimumCents;

    return {
      lines,
      subtotalCents,
      totalCents: minimumApplied ? minimumCents : subtotalCents,
      minimumApplied,
    };
  }
}
