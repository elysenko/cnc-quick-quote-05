import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainConfigService, MachineConfigDto, PricingConfigDto } from '../config/domain-config.service';
import { MaterialDto, MaterialsService } from '../materials/materials.service';
import { ShippingMethodDto, ShippingService } from '../checkout/shipping.service';
import { OrdersService } from '../orders/orders.service';
import { OrderListResponse } from '../orders/orders.types';
import { MinioStorageService } from '../integrations/minio-s3';
import { CreateMaterialDto, UpdateMaterialDto } from '../materials/materials.dto';
import {
  CreateShippingMethodDto,
  UpdateBusinessDto,
  UpdateMachineDto,
  UpdatePricingDto,
  UpdateShippingMethodDto,
} from './admin.dto';
import { BusinessSaveResult, BusinessService } from './business.service';

const LOGO_TYPES = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];

/** Every route here is admin-only: 401 unauthenticated, 403 as a customer. */
@Controller('api/admin')
@Roles(Role.ADMIN)
@UseGuards(RolesGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DomainConfigService,
    private readonly materials: MaterialsService,
    private readonly shipping: ShippingService,
    private readonly orders: OrdersService,
    private readonly business: BusinessService,
    private readonly storage: MinioStorageService,
  ) {}

  // ── Materials ──────────────────────────────────────────────────────────────

  @Get('materials')
  async listMaterials(): Promise<MaterialDto[]> {
    return this.materials.listAll();
  }

  @Post('materials')
  async createMaterial(@Body() dto: CreateMaterialDto): Promise<MaterialDto> {
    return this.materials.create(dto);
  }

  @Patch('materials/:id')
  async updateMaterial(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
  ): Promise<MaterialDto> {
    return this.materials.update(id, dto);
  }

  // ── Pricing / machine config ───────────────────────────────────────────────

  @Get('pricing')
  async getPricing(): Promise<PricingConfigDto> {
    return this.config.pricingDto();
  }

  @Put('pricing')
  async putPricing(@Body() dto: UpdatePricingDto): Promise<PricingConfigDto> {
    await this.config.pricing();
    const row = await this.prisma.pricingConfig.update({
      where: { id: 1 },
      data: {
        setupFee: new Prisma.Decimal(dto.setupFee),
        costPerLinearFoot: new Prisma.Decimal(dto.costPerLinearFoot),
        perSheetCost: new Prisma.Decimal(dto.perSheetCost),
        handlingFee: new Prisma.Decimal(dto.handlingFee),
        costPerBend: new Prisma.Decimal(dto.costPerBend),
        minimumOrder: new Prisma.Decimal(dto.minimumOrder),
      },
    });
    return DomainConfigService.toPricingDto(row);
  }

  @Get('machine')
  async getMachine(): Promise<MachineConfigDto> {
    return this.config.machineDto();
  }

  @Put('machine')
  async putMachine(@Body() dto: UpdateMachineDto): Promise<MachineConfigDto> {
    if (dto.maxQuantity < dto.minQuantity) {
      throw new UnprocessableEntityException(
        'The maximum quantity must be greater than or equal to the minimum.',
      );
    }
    await this.config.machine();
    await this.prisma.machineConfig.update({
      where: { id: 1 },
      data: {
        minQuantity: dto.minQuantity,
        maxQuantity: dto.maxQuantity,
        maxUploadBytes: dto.maxUploadBytes,
        // Normalise ".DXF" / "dxf" to a leading-dot lowercase form.
        allowedExtensions: dto.allowedExtensions
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
          .map((e) => (e.startsWith('.') ? e : `.${e}`)),
        sheetSpacingMm: dto.sheetSpacingMm,
        sheetMarginMm: dto.sheetMarginMm,
        animationSpeed: dto.animationSpeed,
      },
    });
    return this.config.machineDto();
  }

  // ── Business / branding / payments ─────────────────────────────────────────

  @Get('business')
  async getBusiness(): Promise<BusinessSaveResult['config']> {
    return this.business.read();
  }

  @Put('business')
  async putBusiness(@Body() dto: UpdateBusinessDto): Promise<BusinessSaveResult> {
    return this.business.update(dto);
  }

  @Post('business/logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * 1024 * 1024 } }))
  async uploadLogo(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<BusinessSaveResult['config']> {
    if (!file) throw new UnprocessableEntityException('Choose an image file to upload.');
    const extension = extname(file.originalname || '').toLowerCase();
    if (!LOGO_TYPES.includes(extension)) {
      throw new UnprocessableEntityException(
        `Logos must be one of ${LOGO_TYPES.join(', ')}.`,
      );
    }
    const key = `branding/logo-${randomUUID()}${extension}`;
    await this.storage.putObject(key, file.buffer, file.mimetype || 'image/png');
    return this.business.saveLogo(key);
  }

  // ── Shipping methods ───────────────────────────────────────────────────────

  @Get('shipping-methods')
  async listShipping(): Promise<ShippingMethodDto[]> {
    return this.shipping.listAll();
  }

  @Post('shipping-methods')
  async createShipping(@Body() dto: CreateShippingMethodDto): Promise<ShippingMethodDto> {
    return this.shipping.create(dto);
  }

  @Patch('shipping-methods/:id')
  async updateShipping(
    @Param('id') id: string,
    @Body() dto: UpdateShippingMethodDto,
  ): Promise<ShippingMethodDto> {
    return this.shipping.update(id, dto);
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  @Get('orders')
  async listOrders(
    @Query('status') status?: string,
    @Query('page') page?: string,
  ): Promise<OrderListResponse> {
    return this.orders.listAll({ status, page: Number(page) || 1 });
  }
}
