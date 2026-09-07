import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BendLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DrawingsService } from '../drawings/drawings.service';
import { CreateBendDto, UpdateBendDto } from './bends.dto';

export interface BendLineDto {
  id: string;
  drawingId: string;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  angleDeg: number;
  direction: 'up' | 'down';
}

/**
 * Bend lines are metadata laid over the drawing — the stored DXF object is
 * never rewritten, so a customer can always re-download exactly what they sent.
 */
@Injectable()
export class BendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drawings: DrawingsService,
  ) {}

  static toDto(row: BendLine): BendLineDto {
    return {
      id: row.id,
      drawingId: row.drawingId,
      sx: row.sx,
      sy: row.sy,
      ex: row.ex,
      ey: row.ey,
      angleDeg: row.angleDeg,
      direction: row.direction === 'down' ? 'down' : 'up',
    };
  }

  async list(drawingId: string, userId: string): Promise<BendLineDto[]> {
    await this.drawings.findOwned(drawingId, userId);
    const rows = await this.prisma.bendLine.findMany({
      where: { drawingId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(BendsService.toDto);
  }

  async create(drawingId: string, userId: string, dto: CreateBendDto): Promise<BendLineDto> {
    await this.drawings.findOwned(drawingId, userId);
    const row = await this.prisma.bendLine.create({ data: { drawingId, ...dto } });
    return BendsService.toDto(row);
  }

  async update(id: string, userId: string, dto: UpdateBendDto): Promise<BendLineDto> {
    const existing = await this.findOwned(id, userId);
    const row = await this.prisma.bendLine.update({ where: { id: existing.id }, data: dto });
    return BendsService.toDto(row);
  }

  async remove(id: string, userId: string): Promise<void> {
    const existing = await this.findOwned(id, userId);
    await this.prisma.bendLine.delete({ where: { id: existing.id } });
  }

  private async findOwned(id: string, userId: string): Promise<BendLine> {
    const row = await this.prisma.bendLine.findUnique({
      where: { id },
      include: { drawing: true },
    });
    if (!row) throw new NotFoundException('That bend line no longer exists.');
    if (row.drawing.userId !== userId) {
      throw new ForbiddenException('That bend line belongs to another account.');
    }
    return row;
  }
}
