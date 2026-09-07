import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { createFakePrisma, FakePrisma } from '../../test/prisma-mock';
import { DomainConfigService } from '../config/domain-config.service';
import { ResendEmailService } from '../integrations/resend-api';
import { MinioStorageService } from '../integrations/minio-s3';
import { OrdersService } from './orders.service';

const USER_ID = 'user-1';

describe('OrdersService', () => {
  let prisma: FakePrisma;
  let email: { sendOrderConfirmation: jest.Mock };
  let orders: OrdersService;

  const material = {
    id: 'material-1',
    name: 'Mild steel',
    thicknessMm: 2,
  };

  const quote = {
    id: 'quote-1',
    userId: USER_ID,
    materialId: material.id,
    quantity: 5,
    totalCents: 10000,
    status: 'draft',
  };

  beforeEach(() => {
    const fake = createFakePrisma();
    prisma = fake;
    prisma.user.seed({ id: USER_ID, email: 'buyer@example.com' });
    prisma.material.seed({ ...material });
    prisma.quote.seed({ ...quote });
    // Model Prisma's nested include the same way the other specs do: attach
    // the quote (with its material) and the user onto the hydrated order row.
    prisma.order.hydrate = (row) => {
      const relatedQuote = prisma.quote.rows.find((q) => q['id'] === row['quoteId']);
      const relatedMaterial = prisma.material.rows.find((m) => m['id'] === relatedQuote?.['materialId']);
      return {
        ...row,
        quote: { ...relatedQuote, material: relatedMaterial },
        user: prisma.user.rows.find((u) => u['id'] === row['userId']),
      };
    };

    const config = new DomainConfigService(fake);
    email = { sendOrderConfirmation: jest.fn().mockResolvedValue(undefined) };
    const storage = { presignedGetObject: jest.fn() };

    orders = new OrdersService(
      fake,
      config,
      email as unknown as ResendEmailService,
      storage as unknown as MinioStorageService,
    );
  });

  const session = (overrides: Record<string, unknown> = {}): Stripe.Checkout.Session =>
    ({
      id: 'cs_test_1',
      payment_intent: 'pi_test_1',
      metadata: {},
      customer_details: null,
      ...overrides,
    }) as unknown as Stripe.Checkout.Session;

  describe('createFromSession', () => {
    it('creates a paid order priced from the quote', async () => {
      const order = await orders.createFromSession({ quoteId: quote.id, session: session() });
      expect(order.status).toBe('paid');
      expect(order.totalCents).toBe(quote.totalCents);
      expect(prisma.quote.rows[0]['status']).toBe('ordered');
    });

    it('is idempotent: a second call for the same quote returns the existing order, not a duplicate', async () => {
      const first = await orders.createFromSession({ quoteId: quote.id, session: session() });
      const second = await orders.createFromSession({ quoteId: quote.id, session: session() });
      expect(second.id).toBe(first.id);
      expect(prisma.order.rows).toHaveLength(1);
    });
  });

  describe('sendConfirmationEmail', () => {
    it('sends the confirmation email and records emailSentAt when Resend succeeds', async () => {
      const order = await orders.createFromSession({ quoteId: quote.id, session: session() });
      await orders.sendConfirmationEmail(order.id);

      expect(email.sendOrderConfirmation).toHaveBeenCalledTimes(1);
      expect(email.sendOrderConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'buyer@example.com', orderNumber: order.orderNumber }),
      );
      const stored = prisma.order.rows.find((r) => r['id'] === order.id)!;
      expect(stored['emailSentAt']).toBeInstanceOf(Date);
    });

    it('does not block or undo order creation when the email send throws: the order stands and emailSentAt stays unset', async () => {
      email.sendOrderConfirmation.mockRejectedValue(new Error('Resend is down'));
      const order = await orders.createFromSession({ quoteId: quote.id, session: session() });

      // The confirmation flow must still "succeed" from the caller's point of
      // view — sendConfirmationEmail never rejects, even though Resend did.
      await expect(orders.sendConfirmationEmail(order.id)).resolves.toBeUndefined();

      const stored = prisma.order.rows.find((r) => r['id'] === order.id)!;
      expect(stored['status']).toBe('paid');
      expect(stored['totalCents']).toBe(quote.totalCents);
      expect(stored['emailSentAt']).toBeFalsy();
      expect(email.sendOrderConfirmation).toHaveBeenCalledTimes(1);
    });

    it('logs a warning naming the order instead of throwing when the email provider rejects', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      email.sendOrderConfirmation.mockRejectedValue(new Error('rate limited'));
      const order = await orders.createFromSession({ quoteId: quote.id, session: session() });

      await orders.sendConfirmationEmail(order.id);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(order.id));
      warnSpy.mockRestore();
    });

    it('is a no-op that does not throw when the order no longer exists', async () => {
      await expect(orders.sendConfirmationEmail('missing-order')).resolves.toBeUndefined();
      expect(email.sendOrderConfirmation).not.toHaveBeenCalled();
    });
  });
});
