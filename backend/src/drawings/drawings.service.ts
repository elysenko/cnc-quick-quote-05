import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Drawing } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { DomainConfigService } from '../config/domain-config.service';
import { DxfService, ParsedGeometry } from '../dxf/dxf.service';
import { MinioStorageService } from '../integrations/minio-s3';
import { DxfParseError, ServiceUnconfiguredError } from '../common/errors';
import { Polyline } from '../dxf/geometry';

export interface DrawingDto {
  id: string;
  filename: string;
  sizeBytes: number;
  polylines: Polyline[];
  bboxWMm: number;
  bboxHMm: number;
  cutLengthMm: number;
  entityCount: number;
  skippedEntities: string[];
  detectedUnits: string;
  createdAt: string;
}

@Injectable()
export class DrawingsService {
  private readonly logger = new Logger(DrawingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DomainConfigService,
    private readonly dxf: DxfService,
    private readonly storage: MinioStorageService,
  ) {}

  static toDto(row: Drawing): DrawingDto {
    return {
      id: row.id,
      filename: row.filename,
      sizeBytes: row.sizeBytes,
      polylines: (row.geometryJson as unknown as Polyline[]) ?? [],
      bboxWMm: row.bboxWMm,
      bboxHMm: row.bboxHMm,
      cutLengthMm: row.cutLengthMm,
      entityCount: row.entityCount,
      skippedEntities: (row.skippedEntities as unknown as string[]) ?? [],
      detectedUnits: row.detectedUnits,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Rejection order matters and is asserted by the tests: extension first (a
   * cheap check that never reads the body), then size, then parse — and only a
   * drawing that survives all three is written to object storage.
   */
  async upload(
    userId: string,
    file: { originalname: string; buffer: Buffer; size: number },
  ): Promise<DrawingDto> {
    const machine = await this.config.machine();

    const extension = extname(file.originalname || '').toLowerCase();
    const allowed = machine.allowedExtensions.map((e) => e.toLowerCase());
    if (!extension || !allowed.includes(extension)) {
      throw new UnprocessableEntityException(
        `Only ${allowed.join(', ')} files can be uploaded. “${file.originalname}” is not one of them.`,
      );
    }

    const size = file.size ?? file.buffer.length;
    if (size > machine.maxUploadBytes) {
      const limitMb = (machine.maxUploadBytes / (1024 * 1024)).toFixed(1);
      throw new UnprocessableEntityException(
        `That file is ${(size / (1024 * 1024)).toFixed(1)} MB. The maximum upload size is ${limitMb} MB.`,
      );
    }

    let geometry: ParsedGeometry;
    try {
      geometry = this.dxf.parseDxf(file.buffer);
    } catch (error) {
      if (error instanceof DxfParseError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }

    // Storage is best-effort: the geometry we priced from is already parsed and
    // persisted, so an object-store outage must not lose the customer's work.
    const objectKey = `drawings/${userId}/${randomUUID()}${extension}`;
    let storedKey: string | null = null;
    try {
      await this.storage.putObject(objectKey, file.buffer, 'application/dxf');
      storedKey = objectKey;
    } catch (error) {
      if (error instanceof ServiceUnconfiguredError) {
        this.logger.warn('Object storage unconfigured — drawing kept without its source file.');
      } else {
        this.logger.error(`Failed to store ${objectKey}: ${(error as Error).message}`);
      }
    }

    const row = await this.prisma.drawing.create({
      data: {
        userId,
        filename: file.originalname,
        objectKey: storedKey,
        sizeBytes: size,
        geometryJson: geometry.polylines as unknown as object,
        bboxWMm: geometry.bboxWMm,
        bboxHMm: geometry.bboxHMm,
        cutLengthMm: geometry.cutLengthMm,
        entityCount: geometry.entityCount,
        skippedEntities: geometry.skippedEntities as unknown as object,
        detectedUnits: geometry.detectedUnits,
      },
    });

    return DrawingsService.toDto(row);
  }

  /** Owner-scoped: 404 when unknown, 403 when it belongs to somebody else. */
  async findOwned(id: string, userId: string): Promise<Drawing> {
    const row = await this.prisma.drawing.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That drawing no longer exists.');
    if (row.userId !== userId) {
      throw new ForbiddenException('That drawing belongs to another account.');
    }
    return row;
  }

  async get(id: string, userId: string): Promise<DrawingDto> {
    return DrawingsService.toDto(await this.findOwned(id, userId));
  }

  async list(userId: string): Promise<DrawingDto[]> {
    const rows = await this.prisma.drawing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(DrawingsService.toDto);
  }
}
