import { Controller, Get } from '@nestjs/common';
import { MaterialDto, MaterialsService } from './materials.service';

@Controller('api/materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  /** Authenticated customers see only active materials. */
  @Get()
  async list(): Promise<MaterialDto[]> {
    return this.materials.listActive();
  }
}
