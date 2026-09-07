import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { MinioStorageService } from '../integrations/minio-s3';
import { Public } from '../auth/public.decorator';

interface ProbeResult {
  status: 'up' | 'down';
  detail?: string;
}

interface DeepHealth {
  status: 'ok' | 'degraded';
  checks: Record<string, ProbeResult>;
}

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioStorageService,
  ) {}

  /**
   * Liveness. Deliberately dependency-free — the deploy probe hits this, and a
   * transient database blip must not cause the pod to be restarted.
   */
  @Public()
  @Get('health')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Public()
  @Get('api/health')
  liveApi(): { status: 'ok'; uptimeSeconds: number } {
    return this.live();
  }

  /** Readiness: reports each backing service individually. */
  @Public()
  @Get('api/health/deep')
  async deep(): Promise<DeepHealth> {
    const checks: Record<string, ProbeResult> = {
      postgres: await this.probe(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      objectStorage: await this.probe(async () => {
        await this.storage.bucketExists();
      }),
    };
    const status = Object.values(checks).every((c) => c.status === 'up') ? 'ok' : 'degraded';
    return { status, checks };
  }

  private async probe(fn: () => Promise<void>): Promise<ProbeResult> {
    try {
      await fn();
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', detail: (error as Error).message };
    }
  }
}
