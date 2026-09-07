import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Order, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { DomainConfigService } from '../config/domain-config.service';
import { ResendEmailService } from '../integrations/resend-api';
import { MinioStorageService } from '../integrations/minio-s3';
import { ShippingService } from '../checkout/shipping.service';
import { reference } from '../common/money';
import { EMPTY_ADDRESS, OrderDto, OrderListResponse, ShippingAddressDto } from './orders.types';

const PAGE_SIZE = 6;

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { quote: { include: { material: true } }; user: true };
}>;

export interface CreateOrderFromSession {
  quoteId: string;
  session: Stripe.Checkout.Session;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DomainConfigService,
    private readonly email: ResendEmailService,
    private readonly storage: MinioStorageService,
  ) {}

  /**
   * The single idempotent order-creation path, shared by the Stripe webhook and
   * the /payment return-page reconciliation poll. Both may race; the unique
   * constraint on `quoteId` means the loser reads the winner's row rather than
   * double-inserting.
   */
  async createFromSession({ quoteId, session }: CreateOrderFromSession): Promise<Order> {
    const existing = await this.prisma.order.findUnique({ where: { quoteId } });
    if (existing) return existing;

    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { material: true, user: true },
    });
    if (!quote) throw new NotFoundException('That quote no longer exists.');

    const metadata = session.metadata ?? {};
    const shippingMethodId = metadata['shippingMethodId'] || null;
    const shippingCostCents = Number(metadata['shippingCostCents'] ?? 0);
    const shippingMethod = shippingMethodId
      ? await this.prisma.shippingMethod.findUnique({ where: { id: shippingMethodId } })
      : null;

    const estDays = shippingMethod?.estDays ?? 5;
    const estimatedDelivery = new Date(Date.now() + estDays * 24 * 60 * 60 * 1000);

    try {
      const order = await this.prisma.order.create({
        data: {
          quoteId: quote.id,
          userId: quote.userId,
          orderNumber: reference('ORD'),
          confirmationNumber: `${reference('CNF', 4)}-${reference('', 4).replace('-', '')}`,
          shippingMethodId: shippingMethod?.id ?? null,
          shippingMethodName: shippingMethod?.name ?? 'Standard delivery',
          shippingCostCents: Number.isFinite(shippingCostCents) ? shippingCostCents : 0,
          shippingAddressJson: this.extractAddress(session) as unknown as object,
          subtotalCents: quote.totalCents,
          totalCents: quote.totalCents + (Number.isFinite(shippingCostCents) ? shippingCostCents : 0),
          stripeSessionId: session.id,
          stripePaymentIntent:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
          status: 'paid',
          estimatedDelivery,
        },
      });

      await this.prisma.quote.update({ where: { id: quote.id }, data: { status: 'ordered' } });
      return order;
    } catch (error) {
      // Unique violation ⇒ the concurrent path won; return its row.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.order.findUnique({ where: { quoteId } });
        if (winner) return winner;
      }
      throw error;
    }
  }

  /**
   * Best-effort confirmation email. A Resend failure logs and leaves
   * `emailSentAt` null — it never blocks order creation or the confirmation page.
   */
  async sendConfirmationEmail(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { quote: { include: { material: true } }, user: true },
      });
      if (!order) return;

      const business = await this.config.business();
      await this.email.sendOrderConfirmation({
        to: order.user.email,
        orderNumber: order.orderNumber,
        confirmationNumber: order.confirmationNumber,
        totalCents: order.totalCents,
        materialName: order.quote.material.name,
        quantity: order.quote.quantity,
        estimatedDelivery: order.estimatedDelivery.toDateString(),
        branding: {
          companyName: business.companyName,
          supportEmail: business.supportEmail,
          phone: business.phone,
          primaryColor: business.primaryColor,
        },
      });
      await this.prisma.order.update({
        where: { id: order.id },
        data: { emailSentAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `Confirmation email for order ${orderId} was not sent (${(error as Error).message}). The order stands; emailSentAt stays null for retry.`,
      );
    }
  }

  async list(userId: string, page = 1): Promise<OrderListResponse> {
    return this.paginate({ userId }, page);
  }

  /** Admin view across every customer, optionally filtered by status. */
  async listAll(filters: { status?: string; page?: number }): Promise<OrderListResponse> {
    const where: Prisma.OrderWhereInput = {};
    if (filters.status && filters.status !== 'all') where.status = filters.status;
    const result = await this.paginate(where, filters.page ?? 1);
    const revenue = await this.prisma.order.aggregate({
      where: { ...where, status: { not: 'cancelled' } },
      _sum: { totalCents: true },
    });
    return { ...result, revenueCents: revenue._sum.totalCents ?? 0 };
  }

  private async paginate(
    where: Prisma.OrderWhereInput,
    pageInput: number,
  ): Promise<OrderListResponse> {
    const page = Math.max(1, pageInput);
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { quote: { include: { material: true } }, user: true },
      }),
    ]);
    return {
      items: rows.map((row) => OrdersService.toDto(row)),
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  async get(id: string, userId: string, isAdmin: boolean): Promise<OrderDto> {
    const row = await this.findOwned(id, userId, isAdmin);
    const dto = OrdersService.toDto(row);
    dto.receiptUrl = `/api/orders/${row.id}/receipt`;
    return dto;
  }

  async findOwned(id: string, userId: string, isAdmin: boolean): Promise<OrderWithRelations> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: { quote: { include: { material: true } }, user: true },
    });
    if (!row) throw new NotFoundException('That order no longer exists.');
    if (!isAdmin && row.userId !== userId) {
      throw new ForbiddenException('That order belongs to another account.');
    }
    return row;
  }

  async findByQuote(quoteId: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { quoteId } });
  }

  static toDto(row: OrderWithRelations): OrderDto {
    const address = (row.shippingAddressJson as unknown as ShippingAddressDto) ?? EMPTY_ADDRESS;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      confirmationNumber: row.confirmationNumber,
      quoteId: row.quoteId,
      customerEmail: row.user.email,
      materialName: `${row.quote.material.name} ${row.quote.material.thicknessMm} mm`,
      quantity: row.quote.quantity,
      shippingMethodName: row.shippingMethodName,
      shippingCostCents: row.shippingCostCents,
      shippingAddress: address,
      subtotalCents: row.subtotalCents,
      totalCents: row.totalCents,
      status: OrdersService.normalizeStatus(row.status),
      estimatedDelivery: row.estimatedDelivery.toISOString(),
      emailSentAt: row.emailSentAt ? row.emailSentAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private static normalizeStatus(status: string): OrderDto['status'] {
    return status === 'in_production' || status === 'shipped' || status === 'cancelled'
      ? status
      : 'paid';
  }

  /** Stripe collects the delivery address at Checkout; we copy it verbatim. */
  private extractAddress(session: Stripe.Checkout.Session): ShippingAddressDto {
    // `shipping_details` is present on the API object but is not surfaced on
    // the SDK's Session type, so it is read through a narrow structural cast.
    const collected =
      (session as unknown as {
        shipping_details?: { name?: string | null; address?: Stripe.Address | null } | null;
      }).shipping_details ?? null;
    const address = collected?.address ?? session.customer_details?.address ?? null;
    if (!address) return EMPTY_ADDRESS;
    return {
      name: collected?.name ?? session.customer_details?.name ?? '',
      line1: address.line1 ?? '',
      line2: address.line2 ?? undefined,
      city: address.city ?? '',
      region: address.state ?? '',
      postcode: address.postal_code ?? '',
      country: address.country ?? '',
    };
  }

  /** Presigned link when storage holds a receipt; otherwise the stream endpoint. */
  async receiptUrl(order: Order): Promise<string | null> {
    if (!order.stripeSessionId) return null;
    return this.storage.presignedGetObject(`receipts/${order.id}.html`, 900).catch(() => null);
  }
}
