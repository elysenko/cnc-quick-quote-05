import { BreakdownLine, MachineConfig, NestResult, PriceBreakdown, PricingConfig } from './models';

export interface NestInput {
  partW: number;
  partH: number;
  qty: number;
  sheetW: number;
  sheetH: number;
  spacing: number;
  margin: number;
}

/**
 * Axis-aligned grid nesting, top-left origin, no rotation — mirrors the
 * backend `nesting.service.ts` so the wizard preview matches the saved quote.
 * Returns `null` when the part cannot fit a single sheet (PartTooLargeError).
 */
export function nest(input: NestInput): NestResult | null {
  const { partW, partH, qty, sheetW, sheetH, spacing, margin } = input;
  const usableW = sheetW - 2 * margin;
  const usableH = sheetH - 2 * margin;
  if (usableW <= 0 || usableH <= 0) return null;

  const cols = Math.floor((usableW + spacing) / (partW + spacing));
  const rows = Math.floor((usableH + spacing) / (partH + spacing));
  const perSheet = cols * rows;
  if (perSheet <= 0) return null;

  const sheetCount = Math.ceil(qty / perSheet);
  const utilization = (qty * partW * partH) / (sheetCount * sheetW * sheetH);

  const onFirstSheet = Math.min(qty, perSheet);
  const placements = [];
  for (let i = 0; i < onFirstSheet; i++) {
    placements.push({
      x: margin + (i % cols) * (partW + spacing),
      y: margin + Math.floor(i / cols) * (partH + spacing),
    });
  }
  return { cols, rows, perSheet, sheetCount, utilization, placements };
}

export interface PriceInput {
  cutLengthMmTotal: number;
  bendCountTotal: number;
  sheetCount: number;
  materialMultiplier: number;
  config: PricingConfig;
}

const MM_PER_FOOT = 304.8;
const cents = (dollars: number): number => Math.round(dollars * 100);

/**
 * Pure pricing pass over a config snapshot — mirrors the backend
 * `pricing.service.ts`. `costMultiplier` applies to sheet cost only, never to
 * cutting labour. All amounts are integer cents.
 */
export function price(input: PriceInput): PriceBreakdown {
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

  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const minimumCents = cents(config.minimumOrder);
  const minimumApplied = subtotalCents < minimumCents;

  return {
    lines,
    subtotalCents,
    totalCents: minimumApplied ? minimumCents : subtotalCents,
    minimumApplied,
  };
}

export function clampQuantity(qty: number, machine: MachineConfig): number {
  if (!Number.isFinite(qty)) return machine.minQuantity;
  return Math.min(machine.maxQuantity, Math.max(machine.minQuantity, Math.round(qty)));
}
