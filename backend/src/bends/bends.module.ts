import { Module } from '@nestjs/common';
import { BendsController } from './bends.controller';
import { BendsService } from './bends.service';
import { DrawingsModule } from '../drawings/drawings.module';

@Module({
  imports: [DrawingsModule],
  controllers: [BendsController],
  providers: [BendsService],
  exports: [BendsService],
})
export class BendsModule {}
