import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ShippingMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toCents, toNumber } from '../common/money';

export interface ShippingMethodDto {
  id: string;
  name: string;
  kind: 'flat' | 'per_sheet';
  rate: number;
  estDays: number;
  isActive: boolean;
  resolvedCostCents?: number;
}

export interface ShippingMethodInput {
  name: string;
  kind: 'flat' | 'per_sheet';
  rate: number;
  estDays: number;
  isActive?: boolean;
}

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  static toDto(row: ShippingMethod, sheetCount?: number): ShippingMethodDto {
    const rate = toNumber(row.rate);
    const kind = row.kind === 'per_sheet' ? 'per_sheet' : 'flat';
    const dto: ShippingMethodDto = {
      id: row.id,
      name: row.name,
      kind,
      rate,
      estDays: row.estDays,
      isActive: row.isActive,
    };
    if (sheetCount !== undefined) {
      dto.resolvedCostCents = ShippingService.resolveCostCents(row, sheetCount);
    }
    return dto;
  }

  /** Flat methods charge `rate`; per-sheet methods charge `rate × sheetCount`. */
  static resolveCostCents(row: ShippingMethod, sheetCount: number): number {
    const rate = toNumber(row.rate);
    return row.kind === 'per_sheet' ? toCents(rate * sheetCount) : toCents(rate);
  }

  async listAll(): Promise<ShippingMethodDto[]> {
    const rows = await this.prisma.shippingMethod.findMany({
      orderBy: [{ isActive: 'desc' }, { rate: 'asc' }],
    });
    return rows.map((row) => ShippingService.toDto(row));
  }

  /**
   * Active methods priced for this quote.
   *
   * Throws 409 when the shop has no active method: shipping an unpriced order
   * would be worse than blocking checkout, so the UI shows a
   * contact-the-company message instead.
   */
  async listForQuote(sheetCount: number): Promise<ShippingMethodDto[]> {
    const rows = await this.prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: { rate: 'asc' },
    });
    if (rows.length === 0) {
      throw new ConflictException(
        'No shipping methods are available at the moment. Please contact us to complete this order.',
      );
    }
    return rows.map((row) => ShippingService.toDto(row, sheetCount));
  }

  async findOrFail(id: string): Promise<ShippingMethod> {
    const row = await this.prisma.shippingMethod.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That shipping method no longer exists.');
    return row;
  }

  async create(input: ShippingMethodInput): Promise<ShippingMethodDto> {
    const row = await this.prisma.shippingMethod.create({
      data: {
        name: input.name.trim(),
        kind: input.kind,
        rate: new Prisma.Decimal(input.rate),
        estDays: input.estDays,
        isActive: input.isActive ?? true,
      },
    });
    return ShippingService.toDto(row);
  }

  async update(id: string, input: Partial<ShippingMethodInput>): Promise<ShippingMethodDto> {
    await this.findOrFail(id);
    const row = await this.prisma.shippingMethod.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.rate !== undefined ? { rate: new Prisma.Decimal(input.rate) } : {}),
        ...(input.estDays !== undefined ? { estDays: input.estDays } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return ShippingService.toDto(row);
  }
}
