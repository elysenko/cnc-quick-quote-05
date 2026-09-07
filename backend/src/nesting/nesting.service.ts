import { Injectable } from '@nestjs/common';
import { PartTooLargeError } from '../common/errors';

export interface NestInput {
  partW: number;
  partH: number;
  qty: number;
  sheetW: number;
  sheetH: number;
  spacing: number;
  margin: number;
}

export interface Placement {
  x: number;
  y: number;
}

export interface NestResult {
  cols: number;
  rows: number;
  perSheet: number;
  sheetCount: number;
  utilization: number;
  placements: Placement[];
  /** Parts on each sheet, in order. Last sheet carries the remainder. */
  perSheetCounts: number[];
}

/** Placements are emitted for sheet 1 only; the canvas draws later sheets statically. */
const MAX_PLACEMENTS = 2000;

/**
 * Axis-aligned bounding-box grid nesting: top-left origin, no rotation.
 *
 * Deliberately conservative — real sheet usage on the shop floor will match or
 * beat the quote, never fall short of it. Mirrored verbatim by the Angular
 * `core/estimate.ts` preview so the wizard and the saved quote agree.
 */
@Injectable()
export class NestingService {
  nest(input: NestInput): NestResult {
    const { partW, partH, qty, sheetW, sheetH, spacing, margin } = input;

    if (!(qty > 0)) {
      throw new PartTooLargeError('Quantity must be at least one part.');
    }
    if (!(partW > 0) || !(partH > 0)) {
      throw new PartTooLargeError('The part has no measurable size.');
    }

    const usableW = sheetW - 2 * margin;
    const usableH = sheetH - 2 * margin;
    if (usableW <= 0 || usableH <= 0) {
      throw new PartTooLargeError(
        `The configured sheet margin of ${margin} mm leaves no usable area on a ${sheetW} × ${sheetH} mm sheet.`,
      );
    }

    // Spacing sits between parts, so a row of n parts needs
    // n*partW + (n-1)*spacing ≤ usable — rearranged to avoid the off-by-one.
    const cols = Math.floor((usableW + spacing) / (partW + spacing));
    const rows = Math.floor((usableH + spacing) / (partH + spacing));
    const perSheet = cols * rows;

    if (perSheet <= 0) {
      throw new PartTooLargeError(
        `This part is ${partW.toFixed(1)} × ${partH.toFixed(1)} mm, which does not fit the ${sheetW} × ${sheetH} mm sheet for the chosen material. Pick a material with a larger sheet or reduce the part size.`,
      );
    }

    const sheetCount = Math.ceil(qty / perSheet);
    const utilization = (qty * partW * partH) / (sheetCount * sheetW * sheetH);

    const onFirstSheet = Math.min(qty, perSheet, MAX_PLACEMENTS);
    const placements: Placement[] = [];
    for (let i = 0; i < onFirstSheet; i++) {
      placements.push({
        x: margin + (i % cols) * (partW + spacing),
        y: margin + Math.floor(i / cols) * (partH + spacing),
      });
    }

    const perSheetCounts: number[] = [];
    let remaining = qty;
    for (let s = 0; s < sheetCount; s++) {
      const onThis = Math.min(perSheet, remaining);
      perSheetCounts.push(onThis);
      remaining -= onThis;
    }

    return { cols, rows, perSheet, sheetCount, utilization, placements, perSheetCounts };
  }
}
