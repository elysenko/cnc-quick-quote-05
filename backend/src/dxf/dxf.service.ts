import { Injectable, Logger } from '@nestjs/common';
import type {
  IArcEntity,
  ICircleEntity,
  IDxf,
  IEntity,
  ILwpolylineEntity,
  IPolylineEntity,
} from 'dxf-parser';
import type DxfParserClass from 'dxf-parser';

// dxf-parser ships a UMD bundle whose `module.exports` IS the constructor — it
// has no `default` property — so the ESM default-import form compiles fine but
// resolves to `undefined` at runtime under CommonJS. Bind it through require.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DxfParser = require('dxf-parser') as { new (): DxfParserClass };
import { DxfParseError } from '../common/errors';
import {
  arcPoints,
  boundingBox,
  bulgeArcPoints,
  Point,
  Polyline,
  polylineLength,
} from './geometry';

/** Entities this app can cut. Anything else is reported, never silently priced. */
const SUPPORTED = new Set(['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE']);

/**
 * $INSUNITS → millimetres per drawing unit. 0 means "unitless", which is
 * common; we default it to mm and surface the detected unit in the response so
 * an inch-drawn part with no unit header is caught before payment.
 */
const UNIT_SCALE: Record<number, { mm: number; label: string }> = {
  0: { mm: 1, label: 'Unitless (assumed mm)' },
  1: { mm: 25.4, label: 'Inches' },
  2: { mm: 304.8, label: 'Feet' },
  4: { mm: 1, label: 'Millimetres' },
  5: { mm: 10, label: 'Centimetres' },
  6: { mm: 1000, label: 'Metres' },
};

export interface ParsedGeometry {
  polylines: Polyline[];
  cutLengthMm: number;
  bboxWMm: number;
  bboxHMm: number;
  entityCount: number;
  skippedEntities: string[];
  detectedUnits: string;
}

interface VertexLike {
  x?: number;
  y?: number;
  bulge?: number;
}

@Injectable()
export class DxfService {
  private readonly logger = new Logger(DxfService.name);

  /**
   * Parses a DXF into flattened polylines in millimetres.
   * Throws DxfParseError (⇒ 422) on corrupt bytes, an empty modelspace, no
   * supported entity, or a degenerate bounding box.
   */
  parseDxf(buffer: Buffer): ParsedGeometry {
    const text = buffer.toString('utf8');
    if (!text.trim()) {
      throw new DxfParseError('The file is empty.');
    }

    let dxf: IDxf | null;
    try {
      dxf = new DxfParser().parseSync(text);
    } catch (error) {
      throw new DxfParseError(
        `This file could not be read as a DXF drawing (${(error as Error).message}).`,
      );
    }
    if (!dxf || !Array.isArray(dxf.entities)) {
      throw new DxfParseError('This file could not be read as a DXF drawing.');
    }
    if (dxf.entities.length === 0) {
      throw new DxfParseError('The drawing contains no geometry.');
    }

    const { mm: scale, label: detectedUnits } = this.resolveUnits(dxf);

    const polylines: Polyline[] = [];
    const skipped = new Map<string, number>();
    let entityCount = 0;

    for (const entity of dxf.entities) {
      const type = String(entity.type ?? '').toUpperCase();
      if (!SUPPORTED.has(type)) {
        skipped.set(type || 'UNKNOWN', (skipped.get(type || 'UNKNOWN') ?? 0) + 1);
        continue;
      }
      const flattened = this.flattenEntity(entity, type);
      if (!flattened || flattened.points.length < 2) continue;
      polylines.push(this.scalePolyline(flattened, scale));
      entityCount++;
    }

    if (entityCount === 0) {
      const seen = [...skipped.keys()].join(', ');
      throw new DxfParseError(
        seen
          ? `No cuttable geometry found. This drawing only contains ${seen}. Supported entities are lines, arcs, circles and polylines.`
          : 'No cuttable geometry found. Supported entities are lines, arcs, circles and polylines.',
      );
    }

    const box = boundingBox(polylines);
    if (!box) throw new DxfParseError('The drawing geometry could not be measured.');
    const bboxWMm = box.maxX - box.minX;
    const bboxHMm = box.maxY - box.minY;
    if (bboxWMm <= 0 || bboxHMm <= 0) {
      throw new DxfParseError(
        'The drawing has no area — every entity lies on a single line or point.',
      );
    }

    // Normalise to a top-left origin at (0, 0) so the canvas and the nesting
    // grid agree on where the part starts.
    const normalized = polylines.map((line) => ({
      closed: line.closed,
      points: line.points.map(([x, y]) => [x - box.minX, y - box.minY] as Point),
    }));

    const cutLengthMm = normalized.reduce(
      (sum, line) => sum + polylineLength(line.points, line.closed),
      0,
    );

    return {
      polylines: normalized,
      cutLengthMm,
      bboxWMm,
      bboxHMm,
      entityCount,
      skippedEntities: [...skipped.entries()].map(([type, count]) =>
        count > 1 ? `${type} × ${count}` : type,
      ),
      detectedUnits,
    };
  }

  private resolveUnits(dxf: IDxf): { mm: number; label: string } {
    const raw = dxf.header?.['$INSUNITS'];
    const code = typeof raw === 'number' ? raw : 0;
    return UNIT_SCALE[code] ?? { mm: 1, label: `Unit code ${code} (assumed mm)` };
  }

  private scalePolyline(line: Polyline, scale: number): Polyline {
    if (scale === 1) return line;
    return {
      closed: line.closed,
      points: line.points.map(([x, y]) => [x * scale, y * scale] as Point),
    };
  }

  private flattenEntity(entity: IEntity, type: string): Polyline | null {
    switch (type) {
      case 'LINE':
        return this.flattenLine(entity);
      case 'CIRCLE':
        return this.flattenCircle(entity as ICircleEntity);
      case 'ARC':
        return this.flattenArc(entity as IArcEntity);
      case 'LWPOLYLINE':
      case 'POLYLINE':
        return this.flattenPolyline(entity as ILwpolylineEntity | IPolylineEntity);
      default:
        return null;
    }
  }

  private flattenLine(entity: IEntity): Polyline | null {
    const vertices = (entity as unknown as { vertices?: VertexLike[] }).vertices;
    if (!vertices || vertices.length < 2) return null;
    const points = vertices
      .slice(0, 2)
      .map((v) => [v.x ?? 0, v.y ?? 0] as Point);
    return { closed: false, points };
  }

  private flattenCircle(entity: ICircleEntity): Polyline | null {
    const radius = entity.radius;
    if (!Number.isFinite(radius) || radius <= 0) return null;
    const cx = entity.center?.x ?? 0;
    const cy = entity.center?.y ?? 0;
    // Drop the duplicated closing vertex; `closed` carries the final segment.
    return { closed: true, points: arcPoints(cx, cy, radius, 0, Math.PI * 2).slice(0, -1) };
  }

  private flattenArc(entity: IArcEntity): Polyline | null {
    const radius = entity.radius;
    if (!Number.isFinite(radius) || radius <= 0) return null;
    const cx = entity.center?.x ?? 0;
    const cy = entity.center?.y ?? 0;
    // dxf-parser already converts these to radians.
    const start = entity.startAngle ?? 0;
    let sweep = (entity.endAngle ?? 0) - start;
    // A full or negative sweep means the arc wraps past 0; normalise forward.
    while (sweep <= 0) sweep += Math.PI * 2;
    return { closed: false, points: arcPoints(cx, cy, radius, start, sweep) };
  }

  private flattenPolyline(entity: ILwpolylineEntity | IPolylineEntity): Polyline | null {
    const vertices = (entity.vertices ?? []) as VertexLike[];
    if (vertices.length < 2) return null;

    const closed = this.isClosed(entity);
    const points: Point[] = [[vertices[0].x ?? 0, vertices[0].y ?? 0]];

    for (let i = 0; i < vertices.length - 1; i++) {
      const from: Point = [vertices[i].x ?? 0, vertices[i].y ?? 0];
      const to: Point = [vertices[i + 1].x ?? 0, vertices[i + 1].y ?? 0];
      points.push(...bulgeArcPoints(from, to, vertices[i].bulge ?? 0));
    }

    if (closed) {
      const last = vertices[vertices.length - 1];
      const from: Point = [last.x ?? 0, last.y ?? 0];
      const first: Point = [vertices[0].x ?? 0, vertices[0].y ?? 0];
      const bulge = last.bulge ?? 0;
      if (bulge) {
        // Closing arc: append its intermediate points but not the duplicate start.
        points.push(...bulgeArcPoints(from, first, bulge).slice(0, -1));
      }
    }

    return { closed, points };
  }

  private isClosed(entity: ILwpolylineEntity | IPolylineEntity): boolean {
    // LWPOLYLINE closure rides group code 70 bit 1, which dxf-parser exposes
    // as `shape`; POLYLINE uses the same flag.
    return Boolean((entity as { shape?: boolean }).shape);
  }
}
