import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { NestingService } from '../nesting/nesting.service';
import { PricingService } from '../pricing/pricing.service';
import { DrawingsModule } from '../drawings/drawings.module';
import { MaterialsModule } from '../materials/materials.module';

@Module({
  imports: [DrawingsModule, MaterialsModule],
  controllers: [QuotesController],
  providers: [QuotesService, NestingService, PricingService],
  exports: [QuotesService, NestingService, PricingService],
})
export class QuotesModule {}
