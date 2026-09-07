import { Drawing, Polyline } from './models';

/** Approximates a circle as a flattened polyline (matches backend 0.05mm sag flattening). */
function circle(cx: number, cy: number, r: number, segments = 48): Polyline {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return { closed: true, points };
}

/** Rounded-corner rectangle, flattened. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): Polyline {
  const points: Array<[number, number]> = [];
  const corner = (cx: number, cy: number, from: number, to: number) => {
    for (let i = 0; i <= 8; i++) {
      const t = from + ((to - from) * i) / 8;
      points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  };
  corner(x + w - r, y + h - r, 0, Math.PI / 2);
  corner(x + r, y + h - r, Math.PI / 2, Math.PI);
  corner(x + r, y + r, Math.PI, (3 * Math.PI) / 2);
  corner(x + w - r, y + r, (3 * Math.PI) / 2, Math.PI * 2);
  return { closed: true, points };
}

/** Obround slot, flattened. */
function slot(cx: number, cy: number, length: number, r: number): Polyline {
  const points: Array<[number, number]> = [];
  const half = length / 2 - r;
  for (let i = 0; i <= 12; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / 12;
    points.push([cx + half + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  for (let i = 0; i <= 12; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / 12;
    points.push([cx - half + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return { closed: true, points };
}

function polylineLength(pl: Polyline): number {
  let total = 0;
  const pts = pl.points;
  const n = pl.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

export function totalCutLengthMm(polylines: Polyline[]): number {
  return polylines.reduce((sum, pl) => sum + polylineLength(pl), 0);
}

/**
 * Geometry for the demo part: a 180 x 120 mm mounting bracket with four
 * fixing holes, a cable slot and a lightening cut-out. Stands in for the
 * flattened polylines the backend returns from a parsed DXF.
 */
export function demoPolylines(): Polyline[] {
  return [
    roundedRect(0, 0, 180, 120, 10),
    circle(18, 18, 5),
    circle(162, 18, 5),
    circle(18, 102, 5),
    circle(162, 102, 5),
    slot(90, 24, 64, 7),
    roundedRect(52, 46, 76, 46, 8),
  ];
}

export function demoDrawing(): Drawing {
  const polylines = demoPolylines();
  return {
    id: 'dwg_8f31c2',
    filename: 'mounting-bracket-rev-c.dxf',
    sizeBytes: 48219,
    polylines,
    bboxWMm: 180,
    bboxHMm: 120,
    cutLengthMm: Math.round(totalCutLengthMm(polylines) * 10) / 10,
    entityCount: 7,
    skippedEntities: ['TEXT (2 entities)', 'DIMENSION (1 entity)'],
    detectedUnits: 'Millimetres ($INSUNITS = 4)',
    createdAt: '2026-09-05T14:22:11.000Z',
  };
}
