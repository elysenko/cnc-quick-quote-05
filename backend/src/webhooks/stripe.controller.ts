import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import Stripe from 'stripe';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../integrations/stripe-sdk';
import { OrdersService } from '../orders/orders.service';
import { Public } from '../auth/public.decorator';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Stripe webhook receiver.
 *
 * Public by necessity — Stripe cannot authenticate — so the SIGNATURE is the
 * authentication. The raw request body is required byte-for-byte; NestFactory
 * is created with `rawBody: true` and this path is excluded from JSON parsing.
 */
@Controller('api/webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly orders: OrdersService,
  ) {}

  @Public()
  @SkipThrottle()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: boolean }> {
    const secret = await this.stripe.resolveWebhookSecret();
    if (!secret) {
      // Nothing to verify against — refuse rather than trust an unsigned payload.
      this.logger.warn('Stripe webhook received but no signing secret is configured.');
      throw new BadRequestException('Webhook signing secret is not configured.');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header.');
    }

    const raw = req.rawBody ?? (Buffer.isBuffer(req.body) ? req.body : null);
    if (!raw) {
      throw new BadRequestException('Webhook body could not be read.');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(raw, signature, secret);
    } catch (error) {
      // A tampered or replayed payload changes nothing and is logged.
      this.logger.warn(`Rejected Stripe webhook: ${(error as Error).message}`);
      throw new BadRequestException('Signature verification failed.');
    }

    // Idempotency ledger: the unique primary key means a redelivery is a no-op.
    const alreadySeen = await this.prisma.stripeEvent.findUnique({
      where: { eventId: event.id },
    });
    if (alreadySeen) {
      return { received: true };
    }
    try {
      await this.prisma.stripeEvent.create({ data: { eventId: event.id, type: event.type } });
    } catch (error) {
      // Concurrent redelivery raced us to the insert — the unique violation
      // means another request is already (or already has) processed this
      // event, so this one is a no-op rather than a failure.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { received: true };
      }
      throw error;
    }

    if (event.type === 'checkout.session.completed') {
      await this.handleSessionCompleted(event.data.object as Stripe.Checkout.Session);
    }

    return { received: true };
  }

  private async handleSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const quoteId = session.metadata?.['quoteId'];
    if (!quoteId) {
      this.logger.warn(`Checkout session ${session.id} carried no quoteId — ignored.`);
      return;
    }

    // Re-fetch rather than trusting the delivered payload, and require an
    // actually-paid session: a decline or an unpaid session creates nothing.
    let fresh: Stripe.Checkout.Session;
    try {
      fresh = await this.stripe.retrieveSession(session.id);
    } catch (error) {
      this.logger.error(`Could not re-fetch session ${session.id}: ${(error as Error).message}`);
      return;
    }
    if (fresh.payment_status !== 'paid') {
      this.logger.log(`Session ${session.id} is ${fresh.payment_status} — no order created.`);
      return;
    }

    const order = await this.orders.createFromSession({ quoteId, session: fresh });
    // Respond 2xx immediately; email delivery happens out of band and its
    // failure must never turn into a webhook retry storm.
    void this.orders.sendConfirmationEmail(order.id);
  }
}
