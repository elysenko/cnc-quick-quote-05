/**
 * DXF fixtures built in code rather than checked in as binaries, so the
 * expected cut length of every fixture is visible next to the geometry that
 * produces it. The group-code/value pair layout is the real DXF ASCII format —
 * `dxf-parser` reads these exactly as it reads a file from a CAD package.
 */

type Pair = [number, string | number];

function serialize(pairs: Pair[]): string {
  return pairs.flatMap(([code, value]) => [String(code), String(value)]).join('\n') + '\n';
}

function header(insunits: number | null): Pair[] {
  if (insunits === null) return [];
  return [
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$INSUNITS'],
    [70, insunits],
    [0, 'ENDSEC'],
  ];
}

function wrap(insunits: number | null, entities: Pair[]): Buffer {
  return Buffer.from(
    serialize([
      ...header(insunits),
      [0, 'SECTION'],
      [2, 'ENTITIES'],
      ...entities,
      [0, 'ENDSEC'],
      [0, 'EOF'],
    ]),
    'utf8',
  );
}

/** Closed LWPOLYLINE rectangle. Perimeter = 2 * (w + h) drawing units. */
export function rectangleDxf(w = 100, h = 50, insunits: number | null = 4): Buffer {
  const corners: Array<[number, number]> = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  return wrap(insunits, [
    [0, 'LWPOLYLINE'],
    [8, '0'],
    [90, corners.length],
    [70, 1],
    ...corners.flatMap(([x, y]): Pair[] => [
      [10, x],
      [20, y],
    ]),
  ]);
}

/** Single CIRCLE. Circumference = 2 * PI * r drawing units. */
export function circleDxf(radius = 25, insunits: number | null = 4): Buffer {
  return wrap(insunits, [
    [0, 'CIRCLE'],
    [8, '0'],
    [10, radius],
    [20, radius],
    [40, radius],
  ]);
}

/**
 * Open LWPOLYLINE: a straight run, then a bulged segment that is exactly a
 * semicircle (bulge = 1 ⇒ 180°), then a straight run back. This is the case a
 * DXF reader that ignores bulge under-measures.
 */
export function bulgedPolylineDxf(insunits: number | null = 4): Buffer {
  return wrap(insunits, [
    [0, 'LWPOLYLINE'],
    [8, '0'],
    [90, 3],
    [70, 0],
    [10, 0],
    [20, 0],
    [42, 0],
    [10, 100],
    [20, 0],
    [42, 1],
    [10, 100],
    [20, 40],
  ]);
}

/** Two LINEs forming an L. Length = 100 + 50 drawing units. */
export function linesDxf(insunits: number | null = 4): Buffer {
  return wrap(insunits, [
    [0, 'LINE'],
    [8, '0'],
    [10, 0],
    [20, 0],
    [11, 100],
    [21, 0],
    [0, 'LINE'],
    [8, '0'],
    [10, 100],
    [20, 0],
    [11, 100],
    [21, 50],
  ]);
}

/** A quarter ARC of radius r, swept from 0 to 90 degrees. */
export function arcDxf(radius = 20, insunits: number | null = 4): Buffer {
  return wrap(insunits, [
    [0, 'ARC'],
    [8, '0'],
    [10, 0],
    [20, 0],
    [40, radius],
    [50, 0],
    [51, 90],
    [0, 'LINE'],
    [8, '0'],
    [10, 0],
    [20, 0],
    [11, 0],
    [21, radius],
  ]);
}

/** Only entities the cutter cannot process — must be rejected, never priced. */
export function unsupportedOnlyDxf(): Buffer {
  return wrap(4, [
    [0, 'TEXT'],
    [8, '0'],
    [10, 0],
    [20, 0],
    [40, 2.5],
    [1, 'PART LABEL'],
  ]);
}

/** A rectangle plus a TEXT note, to assert the note is reported as skipped. */
export function rectangleWithTextDxf(): Buffer {
  const rect = rectangleDxf(100, 50).toString('utf8');
  const note = serialize([
    [0, 'TEXT'],
    [8, '0'],
    [10, 10],
    [20, 10],
    [40, 2.5],
    [1, 'NOTE'],
  ]);
  // Splice the TEXT entity in before ENDSEC/EOF.
  return Buffer.from(rect.replace('0\nENDSEC\n0\nEOF\n', note + '0\nENDSEC\n0\nEOF\n'), 'utf8');
}

/** Valid DXF structure, empty modelspace. */
export function emptyEntitiesDxf(): Buffer {
  return wrap(4, []);
}

/** All geometry collapsed onto one horizontal line: zero-area bounding box. */
export function degenerateDxf(): Buffer {
  return wrap(4, [
    [0, 'LINE'],
    [8, '0'],
    [10, 0],
    [20, 0],
    [11, 100],
    [21, 0],
  ]);
}

export const CORRUPT_DXF = Buffer.from('this is not a dxf file at all\n%%%\n', 'utf8');
export const EMPTY_FILE = Buffer.from('   \n', 'utf8');
