import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { SettingsController } from './settings.controller';
import { PublicConfigController } from './public-config.controller';
import { BusinessService } from './business.service';
import { MaterialsModule } from '../materials/materials.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [MaterialsModule, CheckoutModule, OrdersModule],
  controllers: [AdminController, SettingsController, PublicConfigController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class AdminModule {}
