import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createFakePrisma, FakePrisma } from '../../test/prisma-mock';
import { DomainConfigService } from '../config/domain-config.service';
import { DrawingsService } from '../drawings/drawings.service';
import { DxfService } from '../dxf/dxf.service';
import { MaterialsService } from '../materials/materials.service';
import { MinioStorageService } from '../integrations/minio-s3';
import { NestingService } from '../nesting/nesting.service';
import { PricingService } from '../pricing/pricing.service';
import { QuotesService } from './quotes.service';

const OWNER = 'user-owner';
const STRANGER = 'user-stranger';

describe('QuotesService', () => {
  let prisma: FakePrisma;
  let quotes: QuotesService;
  let config: DomainConfigService;

  const drawing = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: OWNER,
    filename: 'bracket.dxf',
    objectKey: null,
    sizeBytes: 512,
    geometryJson: [],
    bboxWMm: 100,
    bboxHMm: 50,
    cutLengthMm: 300,
    entityCount: 1,
    skippedEntities: [],
    detectedUnits: 'Millimetres',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const steel = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Mild steel',
    thicknessMm: 2,
    sheetWMm: 1000,
    sheetHMm: 500,
    costMultiplier: new Prisma.Decimal('1.0000'),
    isActive: true,
  };

  const discontinued = { ...steel, id: '33333333-3333-4333-8333-333333333333', name: 'Brass', isActive: false };

  beforeEach(() => {
    const fake = createFakePrisma();
    prisma = fake;
    // Clone on seed: each spec gets its own mutable rows.
    prisma.drawing.seed({ ...drawing });
    prisma.material.seed({ ...steel }, { ...discontinued });
    prisma.quote.hydrate = (row) => ({
      ...row,
      drawing: prisma.drawing.rows.find((d) => d['id'] === row['drawingId']),
      material: prisma.material.rows.find((m) => m['id'] === row['materialId']),
    });

    config = new DomainConfigService(fake);
    const drawings = new DrawingsService(
      fake,
      config,
      new DxfService(),
      {} as unknown as MinioStorageService,
    );
    quotes = new QuotesService(
      fake,
      config,
      drawings,
      new MaterialsService(fake),
      new NestingService(),
      new PricingService(),
    );
  });

  const create = (overrides: Partial<{ drawingId: string; materialId: string; quantity: number }> = {}) =>
    quotes.create(OWNER, { drawingId: drawing.id, materialId: steel.id, quantity: 10, ...overrides });

  describe('quantity validation', () => {
    it('rejects a quantity below the configured minimum, naming the limit', async () => {
      await config.machine();
      prisma.machineConfig.rows[0]['minQuantity'] = 5;
      await expect(create({ quantity: 4 })).rejects.toThrow(/minimum order quantity is 5/i);
      await expect(create({ quantity: 4 })).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects zero and negative quantities', async () => {
      await expect(create({ quantity: 0 })).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(create({ quantity: -3 })).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects a quantity above the configured maximum, naming the limit', async () => {
      await expect(create({ quantity: 501 })).rejects.toThrow(/maximum order quantity is 500/i);
    });

    it('accepts the boundary quantities', async () => {
      await expect(create({ quantity: 1 })).resolves.toBeTruthy();
      await expect(create({ quantity: 500 })).resolves.toBeTruthy();
    });
  });

  describe('material and part validation', () => {
    it('refuses to quote a discontinued material', async () => {
      await expect(create({ materialId: discontinued.id })).rejects.toThrow(/no longer stocked/i);
    });

    it('404s an unknown material', async () => {
      await expect(create({ materialId: '44444444-4444-4444-8444-444444444444' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses a part that does not fit the sheet, with the dimensions in the message', async () => {
      prisma.drawing.rows[0]['bboxWMm'] = 2000;
      await expect(create()).rejects.toThrow(/2000.0 × 50.0 mm/);
      await expect(create()).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuses to quote a drawing that belongs to somebody else', async () => {
      await expect(
        quotes.create(STRANGER, { drawingId: drawing.id, materialId: steel.id, quantity: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('pricing', () => {
    it('multiplies per-part cut length and bend count by the quantity', async () => {
      prisma.bendLine.seed(
        { id: 'b1', drawingId: drawing.id },
        { id: 'b2', drawingId: drawing.id },
      );
      const quote = await create({ quantity: 10 });
      expect(quote.cutLengthMm).toBe(3000); // 300 mm/part * 10
      expect(quote.bendCount).toBe(20); // 2 bends/part * 10
    });

    it('prices a bend-free quote from the default config, to the cent', async () => {
      const quote = await create({ quantity: 10 });
      // 3000 mm = 9.8425 ft * $1.85 = $18.21; 1 sheet * $62 * 1.0;
      // + $45 setup + $12.50 handling = $137.71.
      expect(quote.sheetCount).toBe(1);
      expect(quote.totalCents).toBe(13771);
      expect(quote.breakdown.minimumApplied).toBe(false);
    });

    it('adds exactly the bend charge when bends are present', async () => {
      const withoutBends = await create({ quantity: 10 });
      prisma.bendLine.seed({ id: 'b1', drawingId: drawing.id });
      const withBends = await create({ quantity: 10 });
      expect(withBends.totalCents - withoutBends.totalCents).toBe(3250); // 10 bends * $3.25
    });

    it('charges more sheets for a run that overflows one sheet', async () => {
      // 1000 x 500 sheet, 12 mm margin, 6 mm spacing ⇒ 9 x 8 = 72 parts per sheet.
      const quote = await create({ quantity: 200 });
      expect(quote.nesting.perSheet).toBe(72);
      expect(quote.sheetCount).toBe(3);
      expect(quote.nesting.perSheetCounts).toEqual([72, 72, 56]);
      expect(quote.utilization).toBeGreaterThan(0);
      expect(quote.utilization).toBeLessThanOrEqual(1);
    });

    it('applies the material multiplier to the sheet line', async () => {
      prisma.material.rows[0]['costMultiplier'] = new Prisma.Decimal('2.0000');
      const quote = await create({ quantity: 10 });
      const sheets = quote.breakdown.lines.find((l) => l.key === 'sheets')!;
      expect(sheets.amountCents).toBe(12400); // $62 * 2.0
    });
  });

  describe('pricing snapshot', () => {
    it('freezes the config it priced from, so a later admin change cannot restate the quote', async () => {
      const quote = await create({ quantity: 10 });
      const originalTotal = quote.totalCents;

      // The shop owner puts the setup fee up after the customer saw the price.
      await config.pricing();
      prisma.pricingConfig.rows[0]['setupFee'] = new Prisma.Decimal('500.0000');

      const reloaded = await quotes.get(quote.id, OWNER);
      expect(reloaded.totalCents).toBe(originalTotal);
      expect(reloaded.pricingSnapshot.setupFee).toBe(45);

      // ...and a NEW quote does get the new price.
      const fresh = await create({ quantity: 10 });
      expect(fresh.totalCents).toBe(originalTotal + 45500);
      expect(fresh.pricingSnapshot.setupFee).toBe(500);
    });

    it('records the material multiplier alongside the frozen rates', async () => {
      const quote = await create({ quantity: 10 });
      expect(quote.pricingSnapshot.materialMultiplier).toBe(1);
      expect(quote.pricingSnapshot.costPerLinearFoot).toBe(1.85);
    });
  });

  describe('ownership', () => {
    it('404s an unknown quote and 403s another account’s quote', async () => {
      const quote = await create();
      await expect(quotes.get('does-not-exist', OWNER)).rejects.toBeInstanceOf(NotFoundException);
      await expect(quotes.get(quote.id, STRANGER)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(quotes.get(quote.id, OWNER)).resolves.toBeTruthy();
    });
  });
});
