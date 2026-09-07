import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { BendLineDto, BendsService } from './bends.service';
import { CreateBendDto, UpdateBendDto } from './bends.dto';

@Controller('api')
export class BendsController {
  constructor(private readonly bends: BendsService) {}

  @Get('drawings/:drawingId/bends')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('drawingId') drawingId: string,
  ): Promise<BendLineDto[]> {
    return this.bends.list(drawingId, user.id);
  }

  @Post('drawings/:drawingId/bends')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('drawingId') drawingId: string,
    @Body() dto: CreateBendDto,
  ): Promise<BendLineDto> {
    return this.bends.create(drawingId, user.id, dto);
  }

  @Patch('bends/:id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBendDto,
  ): Promise<BendLineDto> {
    return this.bends.update(id, user.id, dto);
  }

  @Delete('bends/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.bends.remove(id, user.id);
  }
}
