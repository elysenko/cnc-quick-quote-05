import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { DomainConfigService } from '../config/domain-config.service';
import { OrdersService } from './orders.service';
import { OrderDto, OrderListResponse } from './orders.types';
import { renderReceipt } from './receipt';

@Controller('api/orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly config: DomainConfigService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
  ): Promise<OrderListResponse> {
    return this.orders.list(user.id, Number(page) || 1);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<OrderDto> {
    return this.orders.get(id, user.id, user.role === Role.ADMIN);
  }

  /** Streams the generated receipt. Owner-scoped; admins may fetch any. */
  @Get(':id/receipt')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async receipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.orders.findOwned(id, user.id, user.role === Role.ADMIN);
    const dto = OrdersService.toDto(row);
    const business = await this.config.business();
    const html = renderReceipt(dto, {
      companyName: business.companyName,
      supportEmail: business.supportEmail,
      phone: business.phone,
      primaryColor: business.primaryColor,
      addressLines: [
        business.addressLine1,
        business.addressLine2,
        [business.city, business.region, business.postcode].filter(Boolean).join(' '),
        business.country,
      ].filter(Boolean),
    });
    res.setHeader(
      'Content-Disposition',
      `inline; filename="receipt-${dto.orderNumber}.html"`,
    );
    res.send(html);
  }
}
