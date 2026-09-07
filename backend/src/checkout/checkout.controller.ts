import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsUUID } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { CheckoutService, CheckoutStatusDto, CheckoutSummaryDto } from './checkout.service';
import { ShippingMethodDto } from './shipping.service';

class CreateSessionDto {
  @IsUUID(undefined, { message: 'Choose a shipping method.' })
  shippingMethodId!: string;
}

@Controller('api/checkout')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get(':quoteId')
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
  ): Promise<CheckoutSummaryDto> {
    return this.checkout.summary(quoteId, user.id);
  }

  @Get(':quoteId/shipping-methods')
  async shippingMethods(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
  ): Promise<ShippingMethodDto[]> {
    return this.checkout.shippingMethods(quoteId, user.id);
  }

  @Post(':quoteId/session')
  async createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
    @Body() dto: CreateSessionDto,
  ): Promise<{ url: string; sessionId: string }> {
    return this.checkout.createSession(quoteId, user.id, dto.shippingMethodId);
  }

  @Get(':quoteId/status')
  async status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quoteId') quoteId: string,
    @Query('session_id') sessionId?: string,
  ): Promise<CheckoutStatusDto> {
    return this.checkout.status(quoteId, user.id, sessionId);
  }
}
