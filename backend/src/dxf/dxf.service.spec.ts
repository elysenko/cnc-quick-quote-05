import { DxfParseError } from '../common/errors';
import {
  arcDxf,
  bulgedPolylineDxf,
  circleDxf,
  CORRUPT_DXF,
  degenerateDxf,
  emptyEntitiesDxf,
  EMPTY_FILE,
  linesDxf,
  rectangleDxf,
  rectangleWithTextDxf,
  unsupportedOnlyDxf,
} from '../../test/dxf-fixtures';
import { DxfService } from './dxf.service';

describe('DxfService', () => {
  const dxf = new DxfService();

  describe('measurement', () => {
    it('measures a closed rectangle at its exact perimeter', () => {
      const result = dxf.parseDxf(rectangleDxf(100, 50));
      expect(result.bboxWMm).toBeCloseTo(100, 6);
      expect(result.bboxHMm).toBeCloseTo(50, 6);
      expect(result.cutLengthMm).toBeCloseTo(300, 6);
      expect(result.entityCount).toBe(1);
      expect(result.skippedEntities).toEqual([]);
    });

    it('measures a circle at its circumference (pi * d)', () => {
      const radius = 25;
      const result = dxf.parseDxf(circleDxf(radius));
      const circumference = 2 * Math.PI * radius;
      expect(result.bboxWMm).toBeCloseTo(2 * radius, 1);
      expect(result.cutLengthMm).toBeGreaterThan(circumference * 0.999);
      expect(result.cutLengthMm).toBeLessThanOrEqual(circumference);
    });

    it('sums separate LINE entities', () => {
      const result = dxf.parseDxf(linesDxf());
      expect(result.entityCount).toBe(2);
      expect(result.cutLengthMm).toBeCloseTo(150, 6);
    });

    it('follows a bulged polyline around the arc instead of across the chord', () => {
      // 100 mm run, then a bulge=1 semicircle over a 40 mm chord (r = 20).
      const result = dxf.parseDxf(bulgedPolylineDxf());
      const chordOnly = 100 + 40;
      const withArc = 100 + Math.PI * 20;
      expect(result.cutLengthMm).toBeGreaterThan(chordOnly);
      expect(result.cutLengthMm).toBeGreaterThan(withArc * 0.998);
      expect(result.cutLengthMm).toBeLessThanOrEqual(withArc);
    });

    it('measures an ARC over its swept length, not its chord', () => {
      const radius = 20;
      const result = dxf.parseDxf(arcDxf(radius));
      const quarterArc = (Math.PI / 2) * radius;
      // The fixture is a quarter arc plus a radius-length straight line.
      expect(result.cutLengthMm).toBeGreaterThan(quarterArc * 0.998 + radius);
      expect(result.cutLengthMm).toBeLessThanOrEqual(quarterArc + radius);
    });

    it('normalises geometry to a top-left origin at (0, 0)', () => {
      const result = dxf.parseDxf(circleDxf(25));
      const xs = result.polylines.flatMap((p) => p.points.map(([x]) => x));
      const ys = result.polylines.flatMap((p) => p.points.map(([, y]) => y));
      expect(Math.min(...xs)).toBeCloseTo(0, 6);
      expect(Math.min(...ys)).toBeCloseTo(0, 6);
    });
  });

  describe('units', () => {
    it('reads millimetres from $INSUNITS = 4 and leaves the scale alone', () => {
      const result = dxf.parseDxf(rectangleDxf(100, 50, 4));
      expect(result.detectedUnits).toBe('Millimetres');
      expect(result.bboxWMm).toBeCloseTo(100, 6);
    });

    it('scales an inch-drawn part ($INSUNITS = 1) by 25.4', () => {
      const result = dxf.parseDxf(rectangleDxf(4, 2, 1));
      expect(result.detectedUnits).toBe('Inches');
      expect(result.bboxWMm).toBeCloseTo(101.6, 6);
      expect(result.bboxHMm).toBeCloseTo(50.8, 6);
      expect(result.cutLengthMm).toBeCloseTo(12 * 25.4, 6);
    });

    it('scales centimetres and metres', () => {
      expect(dxf.parseDxf(rectangleDxf(10, 5, 5)).bboxWMm).toBeCloseTo(100, 6);
      expect(dxf.parseDxf(rectangleDxf(1, 0.5, 6)).bboxWMm).toBeCloseTo(1000, 6);
    });

    it('assumes millimetres for a unitless drawing and says so', () => {
      const result = dxf.parseDxf(rectangleDxf(100, 50, 0));
      expect(result.detectedUnits).toMatch(/assumed mm/i);
      expect(result.bboxWMm).toBeCloseTo(100, 6);
    });
  });

  describe('unsupported entities', () => {
    it('reports what it ignored while still pricing the cuttable geometry', () => {
      const result = dxf.parseDxf(rectangleWithTextDxf());
      expect(result.entityCount).toBe(1);
      expect(result.cutLengthMm).toBeCloseTo(300, 6);
      expect(result.skippedEntities).toContain('TEXT');
    });

    it('refuses a drawing that contains nothing cuttable', () => {
      expect(() => dxf.parseDxf(unsupportedOnlyDxf())).toThrow(DxfParseError);
      expect(() => dxf.parseDxf(unsupportedOnlyDxf())).toThrow(/no cuttable geometry/i);
    });
  });

  describe('rejections', () => {
    it('rejects an empty file', () => {
      expect(() => dxf.parseDxf(EMPTY_FILE)).toThrow(DxfParseError);
      expect(() => dxf.parseDxf(EMPTY_FILE)).toThrow(/empty/i);
    });

    it('rejects bytes that are not a DXF at all', () => {
      expect(() => dxf.parseDxf(CORRUPT_DXF)).toThrow(DxfParseError);
    });

    it('rejects a structurally valid DXF with an empty modelspace', () => {
      expect(() => dxf.parseDxf(emptyEntitiesDxf())).toThrow(DxfParseError);
    });

    it('rejects geometry with no area', () => {
      expect(() => dxf.parseDxf(degenerateDxf())).toThrow(/no area/i);
    });
  });
});
