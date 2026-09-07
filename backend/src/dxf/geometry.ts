export type Point = [number, number];

export interface Polyline {
  closed: boolean;
  points: Point[];
}

/** Chord sag tolerance, in drawing units, used when flattening curves. */
export const SAG_TOLERANCE = 0.05;

/**
 * Segment count for an arc of `radius` sweeping `sweep` radians such that the
 * maximum deviation between chord and arc stays under `SAG_TOLERANCE`.
 * Clamped so a huge radius cannot explode the vertex count.
 */
export function segmentsForArc(radius: number, sweep: number, tolerance = SAG_TOLERANCE): number {
  const absSweep = Math.abs(sweep);
  if (!Number.isFinite(radius) || radius <= 0 || absSweep === 0) return 1;
  const ratio = Math.max(-1, Math.min(1, 1 - tolerance / radius));
  const maxStep = 2 * Math.acos(ratio);
  if (!Number.isFinite(maxStep) || maxStep <= 0) return 512;
  return Math.max(2, Math.min(512, Math.ceil(absSweep / maxStep)));
}

/** Flattens a circular arc from `startAngle` through `sweep` radians. */
export function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweep: number,
): Point[] {
  const count = segmentsForArc(radius, sweep);
  const points: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const angle = startAngle + (sweep * i) / count;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

/**
 * Expands a DXF bulge (tan of a quarter of the included angle) between two
 * vertices into flattened arc points. Bulge is why a JS DXF reader that ignores
 * it under-measures cut length on any polyline with rounded corners.
 * Returns points EXCLUDING the start vertex (the caller has already pushed it).
 */
export function bulgeArcPoints(from: Point, to: Point, bulge: number): Point[] {
  if (!bulge || Math.abs(bulge) < 1e-10) return [to];

  const [x1, y1] = from;
  const [x2, y2] = to;
  const chord = Math.hypot(x2 - x1, y2 - y1);
  if (chord < 1e-12) return [to];

  const included = 4 * Math.atan(Math.abs(bulge));
  const radius = chord / (2 * Math.sin(included / 2));
  if (!Number.isFinite(radius) || radius <= 0) return [to];

  // Centre sits off the chord midpoint by the sagitta-complement distance,
  // on the side determined by the bulge sign (positive = counter-clockwise).
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const half = chord / 2;
  const offset = Math.sqrt(Math.max(0, radius * radius - half * half));
  const dirX = (x2 - x1) / chord;
  const dirY = (y2 - y1) / chord;
  const sign = bulge > 0 ? 1 : -1;
  // A bulge magnitude above 1 means the arc is the major (>180°) one, which
  // puts the centre on the opposite side of the chord.
  const centreSide = Math.abs(bulge) > 1 ? -sign : sign;
  const cx = midX - centreSide * dirY * offset;
  const cy = midY + centreSide * dirX * offset;

  const startAngle = Math.atan2(y1 - cy, x1 - cx);
  const sweep = sign * included;
  return arcPoints(cx, cy, radius, startAngle, sweep).slice(1);
}

/** Total length of the path through `points`, closing the loop when asked. */
export function polylineLength(points: Point[], closed: boolean): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (closed && points.length > 2) {
    const first = points[0];
    const last = points[points.length - 1];
    total += Math.hypot(first[0] - last[0], first[1] - last[1]);
  }
  return total;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundingBox(polylines: Polyline[]): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of polylines) {
    for (const [x, y] of line.points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}
