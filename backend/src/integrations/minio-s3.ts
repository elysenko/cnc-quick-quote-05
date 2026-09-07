import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'minio';
import { Readable } from 'node:stream';
import { AppConfigService } from '../config/app-config.service';
import { ServiceUnconfiguredError } from '../common/errors';

export const MINIO_CREDENTIAL_KEY = 'MINIO_S3_MINIO_7_2_20_API_KEY';
const DEFAULT_BUCKET = 'cnc-quick-quote';

interface Endpoint {
  host: string;
  port: number;
  useSSL: boolean;
}

/**
 * Object storage for uploaded DXF files, admin logo assets and receipts.
 *
 * Every connection detail is read from the environment (single-namespace
 * runtime contract) with a SystemSetting fallback, so nothing is hardcoded and
 * an administrator can supply credentials at runtime via /admin/settings.
 */
@Injectable()
export class MinioStorageService {
  private readonly logger = new Logger(MinioStorageService.name);
  private client: Client | null = null;
  private bucketReady = false;

  constructor(private readonly appConfig: AppConfigService) {}

  get bucket(): string {
    return process.env.MINIO_BUCKET?.trim() || DEFAULT_BUCKET;
  }

  /** True when object storage can be reached; callers degrade rather than fail hard. */
  async isConfigured(): Promise<boolean> {
    try {
      await this.getClient();
      return true;
    } catch {
      return false;
    }
  }

  private parseEndpoint(raw: string): Endpoint {
    // Accepts "http://host:9000", "host:9000" or "host".
    const withScheme = raw.includes('://') ? raw : `http://${raw}`;
    const url = new URL(withScheme);
    const useSSL = url.protocol === 'https:';
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : useSSL ? 443 : 80,
      useSSL,
    };
  }

  private async credentials(): Promise<{ accessKey: string; secretKey: string }> {
    // The platform mints one opaque credential; accept "access:secret" as well
    // as the conventional root user/password pair.
    const combined = await this.appConfig.resolveConfig(MINIO_CREDENTIAL_KEY);
    if (combined && combined.includes(':')) {
      const idx = combined.indexOf(':');
      return { accessKey: combined.slice(0, idx), secretKey: combined.slice(idx + 1) };
    }
    const accessKey =
      (await this.appConfig.resolveConfig('MINIO_ROOT_USER')) ??
      (await this.appConfig.resolveConfig('MINIO_ACCESS_KEY'));
    const secretKey =
      combined ??
      (await this.appConfig.resolveConfig('MINIO_ROOT_PASSWORD')) ??
      (await this.appConfig.resolveConfig('MINIO_SECRET_KEY'));
    if (!accessKey || !secretKey) {
      throw new ServiceUnconfiguredError(
        MINIO_CREDENTIAL_KEY,
        'Object storage is not configured, so files cannot be stored. An administrator can add the MinIO credential under Admin → Settings.',
      );
    }
    return { accessKey, secretKey };
  }

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;

    const endpointRaw = await this.appConfig.resolveConfig('MINIO_ENDPOINT');
    if (!endpointRaw) {
      throw new ServiceUnconfiguredError(
        'MINIO_ENDPOINT',
        'Object storage endpoint is not configured. An administrator can set it under Admin → Settings.',
      );
    }
    const { host, port, useSSL } = this.parseEndpoint(endpointRaw);
    const { accessKey, secretKey } = await this.credentials();

    this.client = new Client({ endPoint: host, port, useSSL, accessKey, secretKey });
    return this.client;
  }

  private async ensureBucket(client: Client): Promise<void> {
    if (this.bucketReady) return;
    const exists = await client.bucketExists(this.bucket);
    if (!exists) await client.makeBucket(this.bucket);
    this.bucketReady = true;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = await this.getClient();
    await this.ensureBucket(client);
    await client.putObject(this.bucket, key, body, body.length, {
      'Content-Type': contentType,
    });
  }

  async getObjectStream(key: string): Promise<Readable> {
    const client = await this.getClient();
    return client.getObject(this.bucket, key);
  }

  /** Time-limited download URL. Null when storage is unconfigured — never throws. */
  async presignedGetObject(key: string, ttlSeconds = 900): Promise<string | null> {
    try {
      const client = await this.getClient();
      return await client.presignedGetObject(this.bucket, key, ttlSeconds);
    } catch (error) {
      this.logger.warn(`Presigned URL unavailable for ${key}: ${(error as Error).message}`);
      return null;
    }
  }

  async bucketExists(): Promise<boolean> {
    const client = await this.getClient();
    return client.bucketExists(this.bucket);
  }

  /** Invalidates the cached client after a credential change. */
  reset(): void {
    this.client = null;
    this.bucketReady = false;
  }
}
