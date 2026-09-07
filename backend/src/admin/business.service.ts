import { BadRequestException, Injectable } from '@nestjs/common';
import { BusinessConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainConfigService } from '../config/domain-config.service';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { StripeService } from '../integrations/stripe-sdk';
import { MinioStorageService } from '../integrations/minio-s3';
import { UpdateBusinessDto } from './admin.dto';

export interface BusinessConfigDto {
  companyName: string;
  supportEmail: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  stripeSandbox: boolean;
  stripePublishableKey: string;
  /** Masked — the plaintext secret never leaves the server. */
  stripeSecretKeyMasked: string;
  stripeWebhookSecretMasked: string;
}

export interface BusinessSaveResult {
  config: BusinessConfigDto;
  probe: { ok: boolean; message: string } | null;
}

@Injectable()
export class BusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DomainConfigService,
    private readonly crypto: SecretCryptoService,
    private readonly stripe: StripeService,
    private readonly storage: MinioStorageService,
  ) {}

  async read(): Promise<BusinessConfigDto> {
    return this.toDto(await this.config.business());
  }

  /**
   * Saves business settings. When a new Stripe secret key is supplied it is
   * probed against the live API first, so a bad key is reported — and the
   * entire save rejected — at save time rather than at a customer's checkout.
   */
  async update(dto: UpdateBusinessDto): Promise<BusinessSaveResult> {
    await this.config.business();

    let probe: { ok: boolean; message: string } | null = null;
    if (dto.stripeSecretKey) {
      probe = await this.stripe.probeCredentials(dto.stripeSecretKey);
      if (!probe.ok) {
        throw new BadRequestException(
          `Stripe rejected the secret key: ${probe.message}`,
        );
      }
    }

    const row = await this.prisma.businessConfig.update({
      where: { id: 1 },
      data: {
        ...this.pickText(dto),
        ...(dto.stripeSandbox !== undefined ? { stripeSandbox: dto.stripeSandbox } : {}),
        ...(dto.stripePublishableKey !== undefined
          ? { stripePublishableKey: dto.stripePublishableKey.trim() }
          : {}),
        // A blank value means "leave the stored secret alone".
        ...(dto.stripeSecretKey
          ? { stripeSecretKeyEnc: this.crypto.encryptSecret(dto.stripeSecretKey.trim()) }
          : {}),
        ...(dto.stripeWebhookSecret
          ? { stripeWebhookSecretEnc: this.crypto.encryptSecret(dto.stripeWebhookSecret.trim()) }
          : {}),
      },
    });

    return { config: this.toDto(row), probe };
  }

  async saveLogo(key: string): Promise<BusinessConfigDto> {
    const row = await this.prisma.businessConfig.update({
      where: { id: 1 },
      data: { logoObjectKey: key },
    });
    return this.toDto(row);
  }

  /** Presigned logo URL so the browser can render it without a proxy hop. */
  async withLogoUrl(dto: BusinessConfigDto, logoObjectKey: string | null): Promise<BusinessConfigDto> {
    if (!logoObjectKey) return dto;
    const url = await this.storage.presignedGetObject(logoObjectKey, 3600);
    return { ...dto, logoUrl: url };
  }

  private pickText(dto: UpdateBusinessDto): Record<string, string> {
    const fields = [
      'companyName',
      'supportEmail',
      'phone',
      'addressLine1',
      'addressLine2',
      'city',
      'region',
      'postcode',
      'country',
      'primaryColor',
      'accentColor',
    ] as const;
    const data: Record<string, string> = {};
    for (const field of fields) {
      const value = dto[field];
      if (value !== undefined) data[field] = value.trim();
    }
    return data;
  }

  toDto(row: BusinessConfig): BusinessConfigDto {
    return {
      companyName: row.companyName,
      supportEmail: row.supportEmail,
      phone: row.phone,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      region: row.region,
      postcode: row.postcode,
      country: row.country,
      logoUrl: row.logoObjectKey ? `/api/business/logo` : null,
      primaryColor: row.primaryColor,
      accentColor: row.accentColor,
      stripeSandbox: row.stripeSandbox,
      stripePublishableKey: row.stripePublishableKey,
      stripeSecretKeyMasked: this.crypto.maskStored(row.stripeSecretKeyEnc),
      stripeWebhookSecretMasked: this.crypto.maskStored(row.stripeWebhookSecretEnc),
    };
  }
}
