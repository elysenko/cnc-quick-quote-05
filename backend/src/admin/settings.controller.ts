import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AppConfigService } from '../config/app-config.service';
import { SETTINGS_CATALOG } from '../config/settings-catalog';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { MinioStorageService } from '../integrations/minio-s3';
import { UpdateSettingsDto } from './admin.dto';

export interface SettingEntryDto {
  key: string;
  label: string;
  kind: 'service' | 'integration';
  description: string;
  maskedValue: string;
  configured: boolean;
}

/**
 * Credential surface for /admin/settings.
 *
 * Values are only ever returned masked — a GET here never echoes a secret,
 * which is what makes it safe to render in a browser and screenshot.
 */
@Controller('api/admin/settings')
@Roles(Role.ADMIN)
@UseGuards(RolesGuard)
export class SettingsController {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly crypto: SecretCryptoService,
    private readonly storage: MinioStorageService,
  ) {}

  @Get()
  async list(): Promise<SettingEntryDto[]> {
    const entries: SettingEntryDto[] = [];
    for (const definition of SETTINGS_CATALOG) {
      const value = await this.appConfig.resolveConfig(definition.key);
      entries.push({
        ...definition,
        configured: value !== null,
        maskedValue: value ? this.crypto.maskSecret(value) : '',
      });
    }
    return entries;
  }

  @Patch()
  async update(@Body() dto: UpdateSettingsDto): Promise<SettingEntryDto[]> {
    const known = new Set(SETTINGS_CATALOG.map((d) => d.key));
    const entries = (dto.entries ?? [])
      .filter((e) => e && known.has(e.key) && typeof e.value === 'string')
      .map((e) => ({ key: e.key, value: e.value.trim() }))
      .filter((e) => e.value.length > 0);

    await this.appConfig.writeSettings(entries);
    // A storage credential change must rebuild the client on the next call.
    this.storage.reset();
    return this.list();
  }
}
