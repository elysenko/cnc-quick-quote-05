import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Quote } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainConfigService } from '../config/domain-config.service';
import { DrawingsService } from '../drawings/drawings.service';
import { MaterialsService } from '../materials/materials.service';
import { NestingService, NestResult } from '../nesting/nesting.service';
import { PriceBreakdown, PricingService, PricingSnapshot } from '../pricing/pricing.service';
import { PartTooLargeError } from '../common/errors';
import { reference, toNumber } from '../common/money';
import { CreateQuoteDto } from './quotes.dto';
import { QuoteDetailDto, QuoteListResponse, QuoteSummaryDto } from './quotes.types';

const PAGE_SIZE = 6;

type QuoteWithRelations = Prisma.QuoteGetPayload<{
  include: { drawing: true; material: true };
}>;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: DomainConfigService,
    private readonly drawings: DrawingsService,
    private readonly materials: MaterialsService,
    private readonly nesting: NestingService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Prices a quote and freezes the config it was priced from.
   *
   * `pricingSnapshotJson` is why an admin can raise the setup fee tomorrow
   * without silently restating a price a customer was already shown.
   */
  async create(userId: string, dto: CreateQuoteDto): Promise<QuoteDetailDto> {
    const machine = await this.config.machine();
    if (dto.quantity < machine.minQuantity) {
      throw new UnprocessableEntityException(
        `The minimum order quantity is ${machine.minQuantity}.`,
      );
    }
    if (dto.quantity > machine.maxQuantity) {
      throw new UnprocessableEntityException(
        `The maximum order quantity is ${machine.maxQuantity}. Contact us for larger runs.`,
      );
    }

    const drawing = await this.drawings.findOwned(dto.drawingId, userId);
    const material = await this.materials.findOrFail(dto.materialId);
    if (!material.isActive) {
      throw new UnprocessableEntityException(
        `${material.name} is no longer stocked. Choose another material.`,
      );
    }

    let nestResult: NestResult;
    try {
      nestResult = this.nesting.nest({
        partW: drawing.bboxWMm,
        partH: drawing.bboxHMm,
        qty: dto.quantity,
        sheetW: material.sheetWMm,
        sheetH: material.sheetHMm,
        spacing: machine.sheetSpacingMm,
        margin: machine.sheetMarginMm,
      });
    } catch (error) {
      if (error instanceof PartTooLargeError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }

    const bendsPerPart = await this.prisma.bendLine.count({ where: { drawingId: drawing.id } });
    const pricingConfig = await this.config.pricingDto();
    const materialMultiplier = toNumber(material.costMultiplier);

    // Cut length and bend count are per-part figures multiplied by quantity.
    const cutLengthMmTotal = drawing.cutLengthMm * dto.quantity;
    const bendCountTotal = bendsPerPart * dto.quantity;

    const breakdown = this.pricing.price({
      cutLengthMmTotal,
      bendCountTotal,
      sheetCount: nestResult.sheetCount,
      materialMultiplier,
      config: pricingConfig,
    });

    const row = await this.prisma.quote.create({
      data: {
        reference: reference('Q'),
        userId,
        drawingId: drawing.id,
        materialId: material.id,
        quantity: dto.quantity,
        bendCount: bendCountTotal,
        cutLengthMm: cutLengthMmTotal,
        sheetCount: nestResult.sheetCount,
        utilization: nestResult.utilization,
        nestingJson: nestResult as unknown as object,
        pricingSnapshotJson: { ...pricingConfig, materialMultiplier } as unknown as object,
        breakdownJson: breakdown as unknown as object,
        totalCents: breakdown.totalCents,
        status: 'draft',
      },
      include: { drawing: true, material: true },
    });

    return QuotesService.toDetailDto(row);
  }

  async list(
    userId: string,
    filters: { status?: string; sort?: string; page?: number },
  ): Promise<QuoteListResponse> {
    const where: Prisma.QuoteWhereInput = { userId };
    if (filters.status && filters.status !== 'all') where.status = filters.status;

    const orderBy: Prisma.QuoteOrderByWithRelationInput =
      filters.sort === 'total'
        ? { totalCents: 'desc' }
        : filters.sort === 'oldest'
          ? { createdAt: 'asc' }
          : { createdAt: 'desc' };

    const page = Math.max(1, filters.page ?? 1);
    const [total, rows] = await Promise.all([
      this.prisma.quote.count({ where }),
      this.prisma.quote.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { drawing: true, material: true },
      }),
    ]);

    return {
      items: rows.map(QuotesService.toSummaryDto),
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  async get(id: string, userId: string): Promise<QuoteDetailDto> {
    return QuotesService.toDetailDto(await this.findOwned(id, userId));
  }

  async findOwned(id: string, userId: string): Promise<QuoteWithRelations> {
    const row = await this.prisma.quote.findUnique({
      where: { id },
      include: { drawing: true, material: true },
    });
    if (!row) throw new NotFoundException('That quote no longer exists.');
    if (row.userId !== userId) {
      throw new ForbiddenException('That quote belongs to another account.');
    }
    return row;
  }

  static toSummaryDto(row: QuoteWithRelations): QuoteSummaryDto {
    return {
      id: row.id,
      reference: row.reference,
      drawingId: row.drawingId,
      drawingName: row.drawing.filename,
      materialId: row.materialId,
      materialName: QuotesService.materialLabel(row),
      quantity: row.quantity,
      bendCount: row.bendCount,
      cutLengthMm: row.cutLengthMm,
      sheetCount: row.sheetCount,
      utilization: row.utilization,
      totalCents: row.totalCents,
      status: QuotesService.normalizeStatus(row.status),
      createdAt: row.createdAt.toISOString(),
    };
  }

  static toDetailDto(row: QuoteWithRelations): QuoteDetailDto {
    return {
      ...QuotesService.toSummaryDto(row),
      drawing: DrawingsService.toDto(row.drawing),
      material: MaterialsService.toDto(row.material),
      nesting: row.nestingJson as unknown as NestResult,
      breakdown: row.breakdownJson as unknown as PriceBreakdown,
      pricingSnapshot: row.pricingSnapshotJson as unknown as PricingSnapshot & {
        materialMultiplier: number;
      },
    };
  }

  static materialLabel(row: QuoteWithRelations): string {
    return `${row.material.name} ${row.material.thicknessMm} mm`;
  }

  private static normalizeStatus(status: string): QuoteSummaryDto['status'] {
    return status === 'ordered' || status === 'expired' ? status : 'draft';
  }

  static markOrdered(prisma: PrismaService, quoteId: string): Promise<Quote> {
    return prisma.quote.update({ where: { id: quoteId }, data: { status: 'ordered' } });
  }
}
