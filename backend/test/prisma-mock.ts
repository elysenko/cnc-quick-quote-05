import { PrismaService } from '../src/prisma/prisma.service';

type Row = Record<string, unknown>;

/**
 * A tiny in-memory stand-in for the Prisma delegates the service layer uses.
 *
 * It is deliberately not a database: these specs assert service *behaviour*
 * (rejection order, ownership checks, rotation, idempotency), and a real
 * Postgres would only make that slower and environment-dependent. Anything
 * that needs true SQL semantics belongs in a migration test, not here.
 */
export class FakeTable<T extends Row> {
  readonly rows: T[] = [];
  private nextId = 1;

  /**
   * Optional relation resolver, so a spec can model Prisma's `include`
   * without a database. Set it to attach parent rows (e.g. bendLine.drawing).
   */
  hydrate?: (row: T, include: Record<string, unknown>) => T;

  constructor(private readonly name: string) {}

  private withInclude(row: T | null, include?: Record<string, unknown>): T | null {
    if (!row || !include || !this.hydrate) return row;
    return this.hydrate(row, include);
  }

  seed(...rows: T[]): void {
    this.rows.push(...rows);
  }

  private match(row: T, where: Row): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (value === null) return row[key] === null || row[key] === undefined;
      if (typeof value === 'object' && value !== null && 'in' in (value as Row)) {
        return ((value as { in: unknown[] }).in ?? []).includes(row[key]);
      }
      return row[key] === value;
    });
  }

  findUnique = jest.fn(async ({ where, include }: { where: Row; include?: Row }): Promise<T | null> => {
    return this.withInclude(this.rows.find((row) => this.match(row, where)) ?? null, include);
  });

  findFirst = jest.fn(async ({ where, include }: { where?: Row; include?: Row } = {}): Promise<T | null> => {
    return this.withInclude(this.rows.find((row) => this.match(row, where ?? {})) ?? null, include);
  });

  findMany = jest.fn(async ({ where, include }: { where?: Row; include?: Row } = {}): Promise<T[]> => {
    return this.rows
      .filter((row) => this.match(row, where ?? {}))
      .map((row) => this.withInclude(row, include) as T);
  });

  count = jest.fn(async ({ where }: { where?: Row } = {}): Promise<number> => {
    return this.rows.filter((row) => this.match(row, where ?? {})).length;
  });

  create = jest.fn(async ({ data, include }: { data: Row; include?: Row }): Promise<T> => {
    const row = {
      id: `${this.name}-${this.nextId++}`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...data,
    } as unknown as T;
    this.rows.push(row);
    return this.withInclude(row, include) as T;
  });

  update = jest.fn(async ({ where, data }: { where: Row; data: Row }): Promise<T> => {
    const row = this.rows.find((candidate) => this.match(candidate, where));
    if (!row) throw new Error(`${this.name}: no row matching ${JSON.stringify(where)}`);
    Object.assign(row, data);
    return row;
  });

  updateMany = jest.fn(async ({ where, data }: { where: Row; data: Row }): Promise<{ count: number }> => {
    const matched = this.rows.filter((row) => this.match(row, where));
    matched.forEach((row) => Object.assign(row, data));
    return { count: matched.length };
  });

  delete = jest.fn(async ({ where }: { where: Row }): Promise<T> => {
    const index = this.rows.findIndex((row) => this.match(row, where));
    if (index < 0) throw new Error(`${this.name}: nothing to delete`);
    return this.rows.splice(index, 1)[0];
  });

  upsert = jest.fn(async ({ where, create, update }: { where: Row; create: Row; update: Row }): Promise<T> => {
    const existing = this.rows.find((row) => this.match(row, where));
    if (existing) {
      Object.assign(existing, update);
      return existing;
    }
    const row = { ...where, ...create } as unknown as T;
    this.rows.push(row);
    return row;
  });
}

export interface FakePrisma {
  user: FakeTable<Row>;
  refreshToken: FakeTable<Row>;
  drawing: FakeTable<Row>;
  bendLine: FakeTable<Row>;
  material: FakeTable<Row>;
  quote: FakeTable<Row>;
  order: FakeTable<Row>;
  shippingMethod: FakeTable<Row>;
  stripeEvent: FakeTable<Row>;
  pricingConfig: FakeTable<Row>;
  machineConfig: FakeTable<Row>;
  businessConfig: FakeTable<Row>;
}

export function createFakePrisma(): FakePrisma & PrismaService {
  const fake: FakePrisma = {
    user: new FakeTable('user'),
    refreshToken: new FakeTable('refreshToken'),
    drawing: new FakeTable('drawing'),
    bendLine: new FakeTable('bendLine'),
    material: new FakeTable('material'),
    quote: new FakeTable('quote'),
    order: new FakeTable('order'),
    shippingMethod: new FakeTable('shippingMethod'),
    stripeEvent: new FakeTable('stripeEvent'),
    pricingConfig: new FakeTable('pricingConfig'),
    machineConfig: new FakeTable('machineConfig'),
    businessConfig: new FakeTable('businessConfig'),
  };
  return fake as unknown as FakePrisma & PrismaService;
}
