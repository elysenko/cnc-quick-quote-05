import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { DomainConfigService, MachineConfigDto, PricingConfigDto } from '../config/domain-config.service';
import { MinioStorageService } from '../integrations/minio-s3';
import { BusinessConfigDto, BusinessService } from './business.service';

/**
 * Read-only configuration the customer-facing shell needs.
 *
 * Branding is deliberately public so the login and signup screens render the
 * shop's identity before a session exists. Only presentational fields are
 * exposed — no secrets, masked or otherwise.
 */
@Controller('api')
export class PublicConfigController {
  constructor(
    private readonly config: DomainConfigService,
    private readonly business: BusinessService,
    private readonly storage: MinioStorageService,
  ) {}

  @Public()
  @Get('business')
  async branding(): Promise<Omit<BusinessConfigDto, 'stripeSecretKeyMasked' | 'stripeWebhookSecretMasked'>> {
    const row = await this.config.business();
    const dto = this.business.toDto(row);
    const { stripeSecretKeyMasked: _s, stripeWebhookSecretMasked: _w, ...presentational } = dto;
    return presentational;
  }

  @Public()
  @Get('business/logo')
  async logo(@Res() res: Response): Promise<void> {
    const row = await this.config.business();
    if (!row.logoObjectKey) throw new NotFoundException('No logo has been uploaded.');
    const stream = await this.storage.getObjectStream(row.logoObjectKey);
    res.setHeader('Cache-Control', 'public, max-age=300');
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  }

  /** Machine limits drive the upload pre-check and the quantity bounds. */
  @Get('config/machine')
  async machine(): Promise<MachineConfigDto> {
    return this.config.machineDto();
  }

  /** Current rates, used only for the wizard's live preview. The authoritative
   * price is the snapshot stored on the quote by POST /api/quotes. */
  @Get('config/pricing')
  async pricing(): Promise<PricingConfigDto> {
    return this.config.pricingDto();
  }
}
