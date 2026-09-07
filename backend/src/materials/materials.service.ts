import { Injectable, NotFoundException } from '@nestjs/common';
import { Material, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toNumber } from '../common/money';

export interface MaterialDto {
  id: string;
  name: string;
  thicknessMm: number;
  sheetWMm: number;
  sheetHMm: number;
  costMultiplier: number;
  isActive: boolean;
}

export interface MaterialInput {
  name: string;
  thicknessMm: number;
  sheetWMm: number;
  sheetHMm: number;
  costMultiplier: number;
  isActive?: boolean;
}

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  static toDto(row: Material): MaterialDto {
    return {
      id: row.id,
      name: row.name,
      thicknessMm: row.thicknessMm,
      sheetWMm: row.sheetWMm,
      sheetHMm: row.sheetHMm,
      costMultiplier: toNumber(row.costMultiplier),
      isActive: row.isActive,
    };
  }

  /** Customer-facing list — only what the shop currently stocks. */
  async listActive(): Promise<MaterialDto[]> {
    const rows = await this.prisma.material.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { thicknessMm: 'asc' }],
    });
    return rows.map(MaterialsService.toDto);
  }

  /** Admin list — includes deactivated materials so history stays visible. */
  async listAll(): Promise<MaterialDto[]> {
    const rows = await this.prisma.material.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { thicknessMm: 'asc' }],
    });
    return rows.map(MaterialsService.toDto);
  }

  async create(input: MaterialInput): Promise<MaterialDto> {
    const row = await this.prisma.material.create({
      data: {
        name: input.name.trim(),
        thicknessMm: input.thicknessMm,
        sheetWMm: input.sheetWMm,
        sheetHMm: input.sheetHMm,
        costMultiplier: new Prisma.Decimal(input.costMultiplier),
        isActive: input.isActive ?? true,
      },
    });
    return MaterialsService.toDto(row);
  }

  /**
   * Materials are never hard-deleted — a quote references the material it was
   * priced against, so deactivation (isActive = false) is the only removal.
   */
  async update(id: string, input: Partial<MaterialInput>): Promise<MaterialDto> {
    await this.findOrFail(id);
    const row = await this.prisma.material.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.thicknessMm !== undefined ? { thicknessMm: input.thicknessMm } : {}),
        ...(input.sheetWMm !== undefined ? { sheetWMm: input.sheetWMm } : {}),
        ...(input.sheetHMm !== undefined ? { sheetHMm: input.sheetHMm } : {}),
        ...(input.costMultiplier !== undefined
          ? { costMultiplier: new Prisma.Decimal(input.costMultiplier) }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return MaterialsService.toDto(row);
  }

  async findOrFail(id: string): Promise<Material> {
    const row = await this.prisma.material.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That material no longer exists.');
    return row;
  }
}
