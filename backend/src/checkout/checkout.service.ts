import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { DomainConfigService } from '../config/domain-config.service';
import { StripeService } from '../integrations/stripe-sdk';
import { QuotesService } from '../quotes/quotes.service';
import { OrdersService } from '../orders/orders.service';
import { ShippingService, ShippingMethodDto } from './shipping.service';
import { ServiceUnconfiguredError } from '../common/errors';

export interface CheckoutSummaryDto {
  quoteId: string;
  reference: string;
  materialName: string;
  quantity: number;
  sheetCount: number;
  partsCents: number;
  status: 'draft' | 'ordered' | 'expired';
  /** Set once an order exists, so the review step can bounce to confirmation. */
  orderId: string | null;
}

export interface CheckoutStatusDto {
  state: 'pending' | 'confirmed';
  orderId: string | null;
  orderNumber: string | null;
  totalCents: number;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DomainConfigService,
    private readonly quotes: QuotesService,
    private readonly shipping: ShippingService,
    private readonly orders: OrdersService,
    private readonly stripe: StripeService,
  ) {}

  async summary(quoteId: string, userId: string): Promise<CheckoutSummaryDto> {
    const quote = await this.quotes.findOwned(quoteId, userId);
    const order = await this.orders.findByQuote(quote.id);
    return {
      quoteId: quote.id,
      reference: quote.reference,
      materialName: QuotesService.materialLabel(quote),
      quantity: quote.quantity,
      sheetCount: quote.sheetCount,
      partsCents: quote.totalCents,
      status: quote.status === 'ordered' ? 'ordered' : quote.status === 'expired' ? 'expired' : 'draft',
      orderId: order?.id ?? null,
    };
  }

  /** 409 (from ShippingService) when the shop has no active method. */
  async shippingMethods(quoteId: string, userId: string): Promise<ShippingMethodDto[]> {
    const quote = await this.quotes.findOwned(quoteId, userId);
    return this.shipping.listForQuote(quote.sheetCount);
  }

  /**
   * Creates a hosted Checkout Session. No order row is written here — the order
   * only exists once Stripe confirms payment, via the webhook or the return-page
   * reconciliation. A Stripe outage surfaces as 502 with nothing persisted.
   */
  async createSession(
    quoteId: string,
    userId: string,
    shippingMethodId: string,
  ): Promise<{ url: string; sessionId: string }> {
    const quote = await this.quotes.findOwned(quoteId, userId);
    const method = await this.shipping.findOrFail(shippingMethodId);
    const shippingCostCents = ShippingService.resolveCostCents(method, quote.sheetCount);
    const business = await this.config.business();
    const baseUrl = this.publicBaseUrl();

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: quote.totalCents,
          product_data: {
            name: `${QuotesService.materialLabel(quote)} — ${quote.quantity} part${quote.quantity === 1 ? '' : 's'}`,
            description: `Quote ${quote.reference} · ${quote.sheetCount} sheet${quote.sheetCount === 1 ? '' : 's'}`,
          },
        },
      },
    ];
    if (shippingCostCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: shippingCostCents,
          product_data: { name: `Shipping — ${method.name}` },
        },
      });
    }

    try {
      const session = await this.stripe.createCheckoutSession({
        mode: 'payment',
        line_items: lineItems,
        customer_email: (await this.prisma.user.findUnique({ where: { id: userId } }))?.email,
        // Stripe collects the delivery address; the webhook copies it onto the order.
        shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU', 'IE', 'NZ'] },
        success_url: `${baseUrl}/checkout/${quote.id}/payment?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/checkout/${quote.id}/review?status=cancelled`,
        metadata: {
          quoteId: quote.id,
          userId,
          shippingMethodId: method.id,
          shippingCostCents: String(shippingCostCents),
          companyName: business.companyName,
        },
      });

      if (!session.url) {
        throw new BadGatewayException('Stripe did not return a payment link. Try again.');
      }
      return { url: session.url, sessionId: session.id };
    } catch (error) {
      if (error instanceof ServiceUnconfiguredError || error instanceof BadGatewayException) throw error;
      this.logger.error(`Stripe session creation failed: ${(error as Error).message}`);
      throw new BadGatewayException(
        'The payment provider could not be reached. Your quote is unchanged — please try again.',
      );
    }
  }

  /**
   * Return-page reconciliation. The webhook is the fast path; this is the
   * guarantee. Both funnel into OrdersService.createFromSession, which is
   * idempotent, so a webhook landing mid-poll cannot double-create.
   */
  async status(quoteId: string, userId: string, sessionId?: string): Promise<CheckoutStatusDto> {
    const quote = await this.quotes.findOwned(quoteId, userId);
    const existing = await this.orders.findByQuote(quote.id);
    if (existing) {
      return {
        state: 'confirmed',
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        totalCents: existing.totalCents,
      };
    }

    if (sessionId) {
      try {
        const session = await this.stripe.retrieveSession(sessionId);
        if (session.payment_status === 'paid' && session.metadata?.['quoteId'] === quote.id) {
          const order = await this.orders.createFromSession({ quoteId: quote.id, session });
          void this.orders.sendConfirmationEmail(order.id);
          return {
            state: 'confirmed',
            orderId: order.id,
            orderNumber: order.orderNumber,
            totalCents: order.totalCents,
          };
        }
      } catch (error) {
        // Still pending as far as the customer is concerned; keep polling.
        this.logger.warn(`Reconciliation for ${sessionId} deferred: ${(error as Error).message}`);
      }
    }

    return { state: 'pending', orderId: null, orderNumber: null, totalCents: quote.totalCents };
  }

  /** Absolute URL Stripe returns the customer to. */
  private publicBaseUrl(): string {
    const configured = process.env.PUBLIC_BASE_URL ?? process.env.FRONTEND_URL;
    return (configured ?? 'http://localhost:4200').replace(/\/+$/, '');
  }
}
