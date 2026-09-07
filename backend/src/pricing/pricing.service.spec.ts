import { PricingService, PricingSnapshot } from './pricing.service';

const CONFIG: PricingSnapshot = {
  setupFee: 45,
  costPerLinearFoot: 1.85,
  perSheetCost: 62,
  handlingFee: 12.5,
  costPerBend: 3.25,
  minimumOrder: 95,
};

const lineOf = (breakdown: { lines: { key: string; amountCents: number }[] }, key: string) =>
  breakdown.lines.find((l) => l.key === key)!.amountCents;

describe('PricingService', () => {
  const pricing = new PricingService();

  it('itemises every charge and sums them into the subtotal', () => {
    // 3048 mm = exactly 10 linear feet.
    const result = pricing.price({
      cutLengthMmTotal: 3048,
      bendCountTotal: 4,
      sheetCount: 2,
      materialMultiplier: 1,
      config: CONFIG,
    });

    expect(lineOf(result, 'setup')).toBe(4500);
    expect(lineOf(result, 'cutting')).toBe(1850); // 10 ft * $1.85
    expect(lineOf(result, 'sheets')).toBe(12400); // 2 * $62.00 * 1.00
    expect(lineOf(result, 'handling')).toBe(1250);
    expect(lineOf(result, 'bends')).toBe(1300); // 4 * $3.25
    expect(result.subtotalCents).toBe(4500 + 1850 + 12400 + 1250 + 1300);
    expect(result.totalCents).toBe(result.subtotalCents);
    expect(result.minimumApplied).toBe(false);
  });

  it('applies the material multiplier to sheet cost only, never to cutting labour', () => {
    const plain = pricing.price({
      cutLengthMmTotal: 3048,
      bendCountTotal: 0,
      sheetCount: 1,
      materialMultiplier: 1,
      config: CONFIG,
    });
    const premium = pricing.price({
      cutLengthMmTotal: 3048,
      bendCountTotal: 0,
      sheetCount: 1,
      materialMultiplier: 2.5,
      config: CONFIG,
    });

    expect(lineOf(premium, 'sheets')).toBe(15500); // $62.00 * 2.5
    expect(lineOf(premium, 'cutting')).toBe(lineOf(plain, 'cutting'));
    expect(lineOf(premium, 'setup')).toBe(lineOf(plain, 'setup'));
    expect(lineOf(premium, 'handling')).toBe(lineOf(plain, 'handling'));
  });

  it('charges nothing for bends when the drawing has none', () => {
    const result = pricing.price({
      cutLengthMmTotal: 3048,
      bendCountTotal: 0,
      sheetCount: 1,
      materialMultiplier: 1,
      config: CONFIG,
    });
    expect(lineOf(result, 'bends')).toBe(0);
    expect(result.lines.find((l) => l.key === 'bends')!.detail).toContain('0 bends');
  });

  it('scales the bend charge with the total bend count', () => {
    const none = pricing.price({
      cutLengthMmTotal: 30480,
      bendCountTotal: 0,
      sheetCount: 1,
      materialMultiplier: 1,
      config: CONFIG,
    });
    const ten = pricing.price({
      cutLengthMmTotal: 30480,
      bendCountTotal: 10,
      sheetCount: 1,
      materialMultiplier: 1,
      config: CONFIG,
    });
    expect(ten.totalCents - none.totalCents).toBe(3250); // 10 * $3.25
  });

  it('clamps a tiny job up to the minimum order and flags it', () => {
    const result = pricing.price({
      cutLengthMmTotal: 100,
      bendCountTotal: 0,
      sheetCount: 0,
      materialMultiplier: 1,
      config: CONFIG,
    });
    expect(result.subtotalCents).toBeLessThan(9500);
    expect(result.totalCents).toBe(9500);
    expect(result.minimumApplied).toBe(true);
  });

  it('does not clamp a subtotal that exactly equals the minimum order', () => {
    const config = { ...CONFIG, setupFee: 95, costPerLinearFoot: 0, perSheetCost: 0, handlingFee: 0, costPerBend: 0 };
    const result = pricing.price({
      cutLengthMmTotal: 5000,
      bendCountTotal: 3,
      sheetCount: 2,
      materialMultiplier: 1.5,
      config,
    });
    expect(result.subtotalCents).toBe(9500);
    expect(result.minimumApplied).toBe(false);
    expect(result.totalCents).toBe(9500);
  });

  it('returns integer cents for every line — never a floating point remainder', () => {
    const result = pricing.price({
      cutLengthMmTotal: 1234.567,
      bendCountTotal: 7,
      sheetCount: 3,
      materialMultiplier: 1.33,
      config: CONFIG,
    });
    for (const line of result.lines) {
      expect(Number.isInteger(line.amountCents)).toBe(true);
    }
    expect(Number.isInteger(result.totalCents)).toBe(true);
  });
});
