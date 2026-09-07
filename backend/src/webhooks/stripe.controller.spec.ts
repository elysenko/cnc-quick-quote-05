import { BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import type { Request } from 'express';
import { createFakePrisma, FakePrisma } from '../../test/prisma-mock';
import { OrdersService } from '../orders/orders.service';
import { StripeService } from '../integrations/stripe-sdk';
import { StripeWebhookController } from './stripe.controller';

const WEBHOOK_SECRET = 'whsec_specsecret';

function eventBody(id: string, sessionId = 'cs_test_1', quoteId = 'quote-1'): string {
  return JSON.stringify({
    id,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout_session',
        payment_status: 'paid',
        metadata: { quoteId },
      },
    },
  });
}

function signed(payload: string, secret = WEBHOOK_SECRET): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

function requestFor(payload: string): Request & { rawBody?: Buffer } {
  return { rawBody: Buffer.from(payload, 'utf8') } as unknown as Request & { rawBody?: Buffer };
}

describe('StripeWebhookController', () => {
  let prisma: FakePrisma;
  let controller: StripeWebhookController;
  let stripe: {
    resolveWebhookSecret: jest.Mock;
    constructEvent: StripeService['constructEvent'];
    retrieveSession: jest.Mock;
  };
  let orders: { createFromSession: jest.Mock; sendConfirmationEmail: jest.Mock };

  beforeEach(() => {
    const fake = createFakePrisma();
    prisma = fake;
    stripe = {
      resolveWebhookSecret: jest.fn().mockResolvedValue(WEBHOOK_SECRET),
      // The real verifier — a tampered payload must actually fail here.
      constructEvent: (raw, signature, secret) =>
        Stripe.webhooks.constructEvent(raw, signature, secret),
      retrieveSession: jest.fn().mockResolvedValue({
        id: 'cs_test_1',
        payment_status: 'paid',
        metadata: { quoteId: 'quote-1' },
      }),
    };
    orders = {
      createFromSession: jest.fn().mockResolvedValue({ id: 'order-1' }),
      sendConfirmationEmail: jest.fn().mockResolvedValue(undefined),
    };
    controller = new StripeWebhookController(
      fake,
      stripe as unknown as StripeService,
      orders as unknown as OrdersService,
    );
  });

  it('accepts a correctly signed event and creates the order', async () => {
    const payload = eventBody('evt_1');
    const result = await controller.handle(requestFor(payload), signed(payload));

    expect(result).toEqual({ received: true });
    expect(orders.createFromSession).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: 'quote-1' }),
    );
    expect(orders.sendConfirmationEmail).toHaveBeenCalledWith('order-1');
    expect(prisma.stripeEvent.rows).toHaveLength(1);
  });

  it('rejects a tampered payload with 400 and changes nothing', async () => {
    const payload = eventBody('evt_2');
    const signature = signed(payload);
    const tampered = eventBody('evt_2', 'cs_test_ATTACKER');

    await expect(controller.handle(requestFor(tampered), signature)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(orders.createFromSession).not.toHaveBeenCalled();
    expect(prisma.stripeEvent.rows).toHaveLength(0);
  });

  it('rejects a payload signed with the wrong secret', async () => {
    const payload = eventBody('evt_3');
    await expect(
      controller.handle(requestFor(payload), signed(payload, 'whsec_someone_elses')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.stripeEvent.rows).toHaveLength(0);
  });

  it('rejects a request with no signature header', async () => {
    const payload = eventBody('evt_4');
    await expect(controller.handle(requestFor(payload), undefined)).rejects.toThrow(
      /missing stripe signature/i,
    );
  });

  it('refuses to trust anything when no signing secret is configured', async () => {
    stripe.resolveWebhookSecret.mockResolvedValue(null);
    const payload = eventBody('evt_5');
    await expect(controller.handle(requestFor(payload), signed(payload))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(orders.createFromSession).not.toHaveBeenCalled();
  });

  it('processes a redelivered event exactly once', async () => {
    const payload = eventBody('evt_6');
    const signature = signed(payload);

    await controller.handle(requestFor(payload), signature);
    const second = await controller.handle(requestFor(payload), signature);

    expect(second).toEqual({ received: true }); // still 2xx, so Stripe stops retrying
    expect(orders.createFromSession).toHaveBeenCalledTimes(1);
    expect(prisma.stripeEvent.rows).toHaveLength(1);
  });

  it('creates no order when the re-fetched session is not paid', async () => {
    stripe.retrieveSession.mockResolvedValue({
      id: 'cs_test_1',
      payment_status: 'unpaid',
      metadata: { quoteId: 'quote-1' },
    });
    const payload = eventBody('evt_7');
    await expect(controller.handle(requestFor(payload), signed(payload))).resolves.toEqual({
      received: true,
    });
    expect(orders.createFromSession).not.toHaveBeenCalled();
  });

  it('trusts the re-fetched session, not the delivered payload', async () => {
    const payload = eventBody('evt_8');
    await controller.handle(requestFor(payload), signed(payload));
    expect(stripe.retrieveSession).toHaveBeenCalledWith('cs_test_1');
  });

  it('creates no order when the session carries no quote reference', async () => {
    const payload = JSON.stringify({
      id: 'evt_9',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_9', object: 'checkout_session', payment_status: 'paid' } },
    });
    await expect(controller.handle(requestFor(payload), signed(payload))).resolves.toEqual({
      received: true,
    });
    expect(orders.createFromSession).not.toHaveBeenCalled();
  });

  it('records but ignores event types it does not handle', async () => {
    const payload = JSON.stringify({
      id: 'evt_10',
      object: 'event',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_1', object: 'payment_intent' } },
    });
    await expect(controller.handle(requestFor(payload), signed(payload))).resolves.toEqual({
      received: true,
    });
    expect(orders.createFromSession).not.toHaveBeenCalled();
    expect(prisma.stripeEvent.rows).toHaveLength(1);
  });
});
