import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createFakePrisma, FakePrisma } from '../../test/prisma-mock';
import { DomainConfigService } from '../config/domain-config.service';
import { QuotesService } from '../quotes/quotes.service';
import { OrdersService } from '../orders/orders.service';
import { StripeService } from '../integrations/stripe-sdk';
import { ShippingService } from './shipping.service';
import { CheckoutService } from './checkout.service';

const USER_ID = 'user-1';

describe('CheckoutService', () => {
  let prisma: FakePrisma;
  let shipping: ShippingService;
  let quotes: { findOwned: jest.Mock };
  let orders: { findByQuote: jest.Mock; createFromSession: jest.Mock; sendConfirmationEmail: jest.Mock };
  let stripe: { createCheckoutSession: jest.Mock; retrieveSession: jest.Mock };
  let checkout: CheckoutService;

  const makeQuote = (overrides: Record<string, unknown> = {}) => ({
    id: 'quote-1',
    userId: USER_ID,
    reference: 'Q-ABC123',
    quantity: 10,
    sheetCount: 2,
    totalCents: 5000,
    status: 'draft',
    material: { name: 'Mild steel', thicknessMm: 2 },
    ...overrides,
  });

  beforeEach(() => {
    const fake = createFakePrisma();
    prisma = fake;
    prisma.user.seed({ id: USER_ID, email: 'buyer@example.com' });

    const config = new DomainConfigService(fake);
    shipping = new ShippingService(fake);
    quotes = { findOwned: jest.fn().mockResolvedValue(makeQuote()) };
    orders = {
      findByQuote: jest.fn().mockResolvedValue(null),
      createFromSession: jest.fn(),
      sendConfirmationEmail: jest.fn(),
    };
    stripe = {
      createCheckoutSession: jest.fn().mockResolvedValue({ id: 'cs_test_1', url: 'https://stripe.test/pay' }),
      retrieveSession: jest.fn(),
    };

    checkout = new CheckoutService(
      fake,
      config,
      quotes as unknown as QuotesService,
      shipping,
      orders as unknown as OrdersService,
      stripe as unknown as StripeService,
    );
  });

  describe('shippingMethods', () => {
    it('resolves a flat method to the same cost regardless of sheet count', async () => {
      prisma.shippingMethod.seed({
        id: 'ship-flat',
        name: 'Standard',
        kind: 'flat',
        rate: new Prisma.Decimal('12.00'),
        estDays: 5,
        isActive: true,
      });
      quotes.findOwned.mockResolvedValue(makeQuote({ sheetCount: 4 }));

      const [method] = await checkout.shippingMethods('quote-1', USER_ID);
      expect(method.kind).toBe('flat');
      expect(method.resolvedCostCents).toBe(1200); // $12.00, independent of sheetCount
    });

    it('resolves a per-sheet method by multiplying the rate by the quote sheet count', async () => {
      prisma.shippingMethod.seed({
        id: 'ship-per-sheet',
        name: 'Freight',
        kind: 'per_sheet',
        rate: new Prisma.Decimal('4.00'),
        estDays: 7,
        isActive: true,
      });
      quotes.findOwned.mockResolvedValue(makeQuote({ sheetCount: 3 }));

      const [method] = await checkout.shippingMethods('quote-1', USER_ID);
      expect(method.kind).toBe('per_sheet');
      expect(method.resolvedCostCents).toBe(1200); // $4.00 * 3 sheets
    });

    it('returns both kinds priced independently when several active methods exist', async () => {
      prisma.shippingMethod.seed(
        { id: 'ship-flat', name: 'Standard', kind: 'flat', rate: new Prisma.Decimal('12.00'), estDays: 5, isActive: true },
        { id: 'ship-per-sheet', name: 'Freight', kind: 'per_sheet', rate: new Prisma.Decimal('4.00'), estDays: 7, isActive: true },
      );
      quotes.findOwned.mockResolvedValue(makeQuote({ sheetCount: 5 }));

      const methods = await checkout.shippingMethods('quote-1', USER_ID);
      const flat = methods.find((m) => m.id === 'ship-flat')!;
      const perSheet = methods.find((m) => m.id === 'ship-per-sheet')!;
      expect(flat.resolvedCostCents).toBe(1200);
      expect(perSheet.resolvedCostCents).toBe(2000); // $4.00 * 5 sheets
    });

    it('throws 409 when the shop has no active shipping method', async () => {
      prisma.shippingMethod.seed({
        id: 'ship-inactive',
        name: 'Discontinued overnight',
        kind: 'flat',
        rate: new Prisma.Decimal('20.00'),
        estDays: 1,
        isActive: false,
      });

      await expect(checkout.shippingMethods('quote-1', USER_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 409 when no shipping methods exist at all', async () => {
      await expect(checkout.shippingMethods('quote-1', USER_ID)).rejects.toThrow(
        /no shipping methods are available/i,
      );
    });
  });

  describe('createSession — shipping cost line item', () => {
    it('bills a flat method at its flat rate in the Stripe line items', async () => {
      prisma.shippingMethod.seed({
        id: 'ship-flat',
        name: 'Standard',
        kind: 'flat',
        rate: new Prisma.Decimal('15.00'),
        estDays: 5,
        isActive: true,
      });
      quotes.findOwned.mockResolvedValue(makeQuote({ sheetCount: 6 }));

      await checkout.createSession('quote-1', USER_ID, 'ship-flat');

      const params = stripe.createCheckoutSession.mock.calls[0][0];
      const shippingLine = params.line_items.find(
        (li: { price_data: { product_data: { name: string } } }) =>
          li.price_data.product_data.name.startsWith('Shipping'),
      );
      expect(shippingLine.price_data.unit_amount).toBe(1500); // flat $15, independent of 6 sheets
      expect(params.metadata.shippingCostCents).toBe('1500');
    });

    it('bills a per-sheet method scaled by the quote sheet count in the Stripe line items', async () => {
      prisma.shippingMethod.seed({
        id: 'ship-per-sheet',
        name: 'Freight',
        kind: 'per_sheet',
        rate: new Prisma.Decimal('5.00'),
        estDays: 7,
        isActive: true,
      });
      quotes.findOwned.mockResolvedValue(makeQuote({ sheetCount: 3 }));

      await checkout.createSession('quote-1', USER_ID, 'ship-per-sheet');

      const params = stripe.createCheckoutSession.mock.calls[0][0];
      const shippingLine = params.line_items.find(
        (li: { price_data: { product_data: { name: string } } }) =>
          li.price_data.product_data.name.startsWith('Shipping'),
      );
      expect(shippingLine.price_data.unit_amount).toBe(1500); // $5.00 * 3 sheets
      expect(params.metadata.shippingCostCents).toBe('1500');
    });

    it('omits the shipping line item entirely when the resolved cost is zero', async () => {
      prisma.shippingMethod.seed({
        id: 'ship-free',
        name: 'Local pickup',
        kind: 'flat',
        rate: new Prisma.Decimal('0.00'),
        estDays: 1,
        isActive: true,
      });
      quotes.findOwned.mockResolvedValue(makeQuote({ sheetCount: 2 }));

      await checkout.createSession('quote-1', USER_ID, 'ship-free');

      const params = stripe.createCheckoutSession.mock.calls[0][0];
      expect(params.line_items).toHaveLength(1); // parts only, no shipping line
    });
  });
});
