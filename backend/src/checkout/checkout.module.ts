import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ShippingService } from './shipping.service';
import { QuotesModule } from '../quotes/quotes.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [QuotesModule, OrdersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, ShippingService],
  exports: [CheckoutService, ShippingService],
})
export class CheckoutModule {}
