import { Injectable } from '@nestjs/common';
import { BusinessConfig, MachineConfig, PricingConfig, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toNumber } from '../common/money';
import { PricingSnapshot } from '../pricing/pricing.service';

/**
 * Starting values for the three singleton config rows.
 *
 * These are *application configuration*, not sample business data: without a
 * config row the pricing and nesting engines have nothing to run against, so
 * the row is created on first read rather than seeded. An administrator edits
 * them under /admin; no materials, shipping methods or orders are invented.
 */
const PRICING_DEFAULTS = {
  setupFee: new Prisma.Decimal('45.0000'),
  costPerLinearFoot: new Prisma.Decimal('1.8500'),
  perSheetCost: new Prisma.Decimal('62.0000'),
  handlingFee: new Prisma.Decimal('12.5000'),
  costPerBend: new Prisma.Decimal('3.2500'),
  minimumOrder: new Prisma.Decimal('95.0000'),
};

const MACHINE_DEFAULTS = {
  minQuantity: 1,
  maxQuantity: 500,
  maxUploadBytes: 10 * 1024 * 1024,
  allowedExtensions: ['.dxf'],
  sheetSpacingMm: 6,
  sheetMarginMm: 12,
  animationSpeed: 320,
};

const BUSINESS_DEFAULTS = {
  companyName: 'CNC Quick Quote',
  supportEmail: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postcode: '',
  country: '',
  logoObjectKey: null,
  primaryColor: '#1e4fd8',
  accentColor: '#ea6a0c',
  stripeSandbox: true,
  stripePublishableKey: '',
  stripeSecretKeyEnc: null,
  stripeWebhookSecretEnc: null,
};

export interface PricingConfigDto extends PricingSnapshot {}

export interface MachineConfigDto {
  minQuantity: number;
  maxQuantity: number;
  maxUploadBytes: number;
  allowedExtensions: string[];
  sheetSpacingMm: number;
  sheetMarginMm: number;
  animationSpeed: number;
}

/**
 * Accessors for the three singleton (id = 1) config rows. Each getter creates
 * the row on first access so a fresh database boots into a valid state without
 * the essential seed having to write business rows.
 */
@Injectable()
export class DomainConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async pricing(): Promise<PricingConfig> {
    return this.prisma.pricingConfig.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...PRICING_DEFAULTS },
    });
  }

  async machine(): Promise<MachineConfig> {
    return this.prisma.machineConfig.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...MACHINE_DEFAULTS },
    });
  }

  async business(): Promise<BusinessConfig> {
    return this.prisma.businessConfig.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...BUSINESS_DEFAULTS },
    });
  }

  async pricingDto(): Promise<PricingConfigDto> {
    return DomainConfigService.toPricingDto(await this.pricing());
  }

  async machineDto(): Promise<MachineConfigDto> {
    const row = await this.machine();
    return {
      minQuantity: row.minQuantity,
      maxQuantity: row.maxQuantity,
      maxUploadBytes: row.maxUploadBytes,
      allowedExtensions: row.allowedExtensions,
      sheetSpacingMm: row.sheetSpacingMm,
      sheetMarginMm: row.sheetMarginMm,
      animationSpeed: row.animationSpeed,
    };
  }

  static toPricingDto(row: PricingConfig): PricingConfigDto {
    return {
      setupFee: toNumber(row.setupFee),
      costPerLinearFoot: toNumber(row.costPerLinearFoot),
      perSheetCost: toNumber(row.perSheetCost),
      handlingFee: toNumber(row.handlingFee),
      costPerBend: toNumber(row.costPerBend),
      minimumOrder: toNumber(row.minimumOrder),
    };
  }
}
