import {
  arcPoints,
  boundingBox,
  bulgeArcPoints,
  polylineLength,
  Point,
  segmentsForArc,
} from './geometry';

describe('geometry', () => {
  describe('polylineLength', () => {
    it('sums the segments of an open path', () => {
      const points: Point[] = [
        [0, 0],
        [3, 0],
        [3, 4],
      ];
      expect(polylineLength(points, false)).toBeCloseTo(7, 10);
    });

    it('adds the closing segment when the path is closed', () => {
      const points: Point[] = [
        [0, 0],
        [3, 0],
        [3, 4],
      ];
      expect(polylineLength(points, true)).toBeCloseTo(12, 10);
    });

    it('is zero for a single point', () => {
      expect(polylineLength([[1, 1]], true)).toBe(0);
    });
  });

  describe('segmentsForArc', () => {
    it('uses more segments as the sweep grows', () => {
      const quarter = segmentsForArc(50, Math.PI / 2);
      const full = segmentsForArc(50, Math.PI * 2);
      expect(full).toBeGreaterThan(quarter);
    });

    it('never returns fewer than two segments for a real sweep, or explodes on a huge radius', () => {
      expect(segmentsForArc(1e9, Math.PI * 2)).toBeLessThanOrEqual(512);
      expect(segmentsForArc(10, Math.PI)).toBeGreaterThanOrEqual(2);
      expect(segmentsForArc(0, Math.PI)).toBe(1);
    });
  });

  describe('arcPoints', () => {
    it('flattens a full circle to within the sag tolerance of its true circumference', () => {
      const radius = 25;
      const points = arcPoints(0, 0, radius, 0, Math.PI * 2);
      const length = polylineLength(points, false);
      const circumference = 2 * Math.PI * radius;
      expect(length).toBeGreaterThan(circumference * 0.999);
      expect(length).toBeLessThanOrEqual(circumference);
    });

    it('starts and ends on the sweep endpoints', () => {
      const points = arcPoints(10, 10, 5, 0, Math.PI / 2);
      expect(points[0][0]).toBeCloseTo(15, 9);
      expect(points[0][1]).toBeCloseTo(10, 9);
      expect(points[points.length - 1][0]).toBeCloseTo(10, 9);
      expect(points[points.length - 1][1]).toBeCloseTo(15, 9);
    });
  });

  describe('bulgeArcPoints', () => {
    it('returns just the endpoint for a straight segment', () => {
      expect(bulgeArcPoints([0, 0], [10, 0], 0)).toEqual([[10, 0]]);
    });

    it('expands a bulge of 1 into a semicircle, not a chord', () => {
      // Chord of 20 with bulge 1 ⇒ half-circle of radius 10 ⇒ length PI*10.
      const points = bulgeArcPoints([0, 0], [20, 0], 1);
      const length = polylineLength([[0, 0], ...points], false);
      const semicircle = Math.PI * 10;
      // Flattening always inscribes the arc, so the chord path is a hair short.
      expect(length).toBeGreaterThan(semicircle * 0.998);
      expect(length).toBeLessThanOrEqual(semicircle);
      expect(points[points.length - 1][0]).toBeCloseTo(20, 6);
      expect(points[points.length - 1][1]).toBeCloseTo(0, 6);
    });

    it('expands a quarter-round corner to its arc length', () => {
      // bulge = tan(90deg / 4) ⇒ 90 degree arc. Chord 10*sqrt(2) ⇒ radius 10.
      const bulge = Math.tan(Math.PI / 8);
      const points = bulgeArcPoints([0, 0], [10, 10], bulge);
      const length = polylineLength([[0, 0], ...points], false);
      const quarter = (Math.PI / 2) * 10;
      expect(length).toBeGreaterThan(quarter * 0.998);
      expect(length).toBeLessThanOrEqual(quarter);
    });

    it('mirrors the arc when the bulge sign flips', () => {
      const positive = bulgeArcPoints([0, 0], [20, 0], 1);
      const negative = bulgeArcPoints([0, 0], [20, 0], -1);
      const midPositive = positive[Math.floor(positive.length / 2)];
      const midNegative = negative[Math.floor(negative.length / 2)];
      expect(Math.sign(midPositive[1])).toBe(-Math.sign(midNegative[1]));
    });

    it('degrades to the endpoint on a zero-length chord', () => {
      expect(bulgeArcPoints([5, 5], [5, 5], 1)).toEqual([[5, 5]]);
    });
  });

  describe('boundingBox', () => {
    it('spans every polyline', () => {
      const box = boundingBox([
        { closed: false, points: [[0, 0], [10, 5]] },
        { closed: false, points: [[-3, 2], [4, 20]] },
      ]);
      expect(box).toEqual({ minX: -3, minY: 0, maxX: 10, maxY: 20 });
    });

    it('is null when there is nothing measurable', () => {
      expect(boundingBox([])).toBeNull();
      expect(boundingBox([{ closed: false, points: [[NaN, NaN]] }])).toBeNull();
    });
  });
});
