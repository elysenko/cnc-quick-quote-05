import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The scaffolder writes this literal into the pod env for integrations whose
 * credential has not been minted yet. Treated as "absent" so the SystemSetting
 * fallback wins and the admin can supply the real value at runtime.
 */
export const PLACEHOLDER = 'PLACEHOLDER_CONFIGURE_IN_SETTINGS';

/**
 * Credential resolution for services and integrations.
 *
 * Precedence: process.env → SystemSetting row → null. Never throws; call sites
 * decide whether a null is fatal (integrations raise ServiceUnconfiguredError).
 * Resolved values are cached in-process and invalidated explicitly whenever
 * PATCH /api/admin/settings writes, so a newly entered key takes effect at once.
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);
  private readonly cache = new Map<string, string | null>();

  constructor(private readonly prisma: PrismaService) {}

  async resolveConfig(key: string): Promise<string | null> {
    if (this.cache.has(key)) return this.cache.get(key) ?? null;

    const fromEnv = process.env[key];
    if (fromEnv && fromEnv.trim() && fromEnv.trim() !== PLACEHOLDER) {
      this.cache.set(key, fromEnv.trim());
      return fromEnv.trim();
    }

    let stored: string | null = null;
    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { key } });
      const value = row?.value?.trim();
      if (value && value !== PLACEHOLDER) stored = value;
    } catch (error) {
      // A settings lookup must never take down a request path.
      this.logger.warn(`Could not read SystemSetting "${key}": ${(error as Error).message}`);
      return null;
    }

    this.cache.set(key, stored);
    return stored;
  }

  /** True when the key resolves to a usable value. */
  async isConfigured(key: string): Promise<boolean> {
    return (await this.resolveConfig(key)) !== null;
  }

  /** Upserts settings and busts the cache so the next read sees the new value. */
  async writeSettings(entries: Array<{ key: string; value: string }>): Promise<void> {
    for (const entry of entries) {
      await this.prisma.systemSetting.upsert({
        where: { key: entry.key },
        update: { value: entry.value },
        create: { key: entry.key, value: entry.value },
      });
      this.cache.delete(entry.key);
    }
  }

  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}
