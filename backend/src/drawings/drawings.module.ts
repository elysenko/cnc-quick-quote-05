import { Module } from '@nestjs/common';
import { DrawingsController } from './drawings.controller';
import { DrawingsService } from './drawings.service';
import { DxfService } from '../dxf/dxf.service';

@Module({
  controllers: [DrawingsController],
  providers: [DrawingsService, DxfService],
  exports: [DrawingsService, DxfService],
})
export class DrawingsModule {}
