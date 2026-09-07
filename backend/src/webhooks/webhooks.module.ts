import { Module } from '@nestjs/common';
import { StripeWebhookController } from './stripe.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [StripeWebhookController],
})
export class WebhooksModule {}
