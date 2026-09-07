import { PartTooLargeError } from '../common/errors';
import { NestingService } from './nesting.service';

const SHEET = { sheetW: 1000, sheetH: 500, spacing: 0, margin: 0 };

describe('NestingService', () => {
  const nesting = new NestingService();

  it('packs a small run onto a single sheet', () => {
    const result = nesting.nest({ partW: 100, partH: 50, qty: 5, ...SHEET });
    expect(result.cols).toBe(10);
    expect(result.rows).toBe(10);
    expect(result.perSheet).toBe(100);
    expect(result.sheetCount).toBe(1);
    expect(result.placements).toHaveLength(5);
    expect(result.perSheetCounts).toEqual([5]);
  });

  it('emits top-left origin placements that walk left-to-right then down', () => {
    const result = nesting.nest({ partW: 100, partH: 50, qty: 12, ...SHEET });
    expect(result.placements[0]).toEqual({ x: 0, y: 0 });
    expect(result.placements[1]).toEqual({ x: 100, y: 0 });
    expect(result.placements[9]).toEqual({ x: 900, y: 0 });
    expect(result.placements[10]).toEqual({ x: 0, y: 50 });
  });

  it('fits a part that exactly matches the usable sheet', () => {
    const result = nesting.nest({ partW: 1000, partH: 500, qty: 1, ...SHEET });
    expect(result.perSheet).toBe(1);
    expect(result.sheetCount).toBe(1);
    expect(result.utilization).toBeCloseTo(1, 10);
  });

  it('rounds part counts up onto whole extra sheets', () => {
    const result = nesting.nest({ partW: 100, partH: 50, qty: 101, ...SHEET });
    expect(result.perSheet).toBe(100);
    expect(result.sheetCount).toBe(2);
    expect(result.perSheetCounts).toEqual([100, 1]);
    // Two sheets bought, one and a bit used.
    expect(result.utilization).toBeCloseTo((101 * 100 * 50) / (2 * 1000 * 500), 10);
  });

  it('reserves spacing between parts but not outside the outermost ones', () => {
    // 10 columns would need 10*100 + 9*6 = 1054 mm; only 9 fit in 1000 mm.
    const result = nesting.nest({ partW: 100, partH: 50, qty: 1, ...SHEET, spacing: 6 });
    expect(result.cols).toBe(9);
    expect(result.placements[0]).toEqual({ x: 0, y: 0 });
  });

  it('honours the sheet margin by shrinking the usable area and offsetting parts', () => {
    const result = nesting.nest({ partW: 100, partH: 50, qty: 2, ...SHEET, margin: 12 });
    expect(result.cols).toBe(9); // floor(976 / 100)
    expect(result.rows).toBe(9); // floor(476 / 50)
    expect(result.placements[0]).toEqual({ x: 12, y: 12 });
  });

  it('throws PartTooLargeError when not one part fits the sheet', () => {
    expect(() => nesting.nest({ partW: 1200, partH: 50, qty: 1, ...SHEET })).toThrow(PartTooLargeError);
    expect(() => nesting.nest({ partW: 1200, partH: 50, qty: 1, ...SHEET })).toThrow(/does not fit/i);
  });

  it('throws when the configured margin leaves no usable area', () => {
    expect(() => nesting.nest({ partW: 10, partH: 10, qty: 1, ...SHEET, margin: 600 })).toThrow(
      PartTooLargeError,
    );
  });

  it('rejects a non-positive quantity or a zero-size part', () => {
    expect(() => nesting.nest({ partW: 100, partH: 50, qty: 0, ...SHEET })).toThrow(PartTooLargeError);
    expect(() => nesting.nest({ partW: 0, partH: 50, qty: 1, ...SHEET })).toThrow(PartTooLargeError);
  });

  it('caps emitted placements while still counting every sheet', () => {
    const result = nesting.nest({ partW: 1, partH: 1, qty: 5000, sheetW: 1000, sheetH: 500, spacing: 0, margin: 0 });
    expect(result.perSheet).toBe(500000);
    expect(result.sheetCount).toBe(1);
    expect(result.placements.length).toBeLessThanOrEqual(2000);
  });
});
