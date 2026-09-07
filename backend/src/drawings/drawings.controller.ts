import {
  Controller,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { DrawingDto, DrawingsService } from './drawings.service';

/** Hard ceiling; the configurable per-install limit is enforced in the service. */
const ABSOLUTE_MAX_BYTES = 64 * 1024 * 1024;

@Controller('api/drawings')
export class DrawingsController {
  constructor(private readonly drawings: DrawingsService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ABSOLUTE_MAX_BYTES } }))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<DrawingDto> {
    if (!file) {
      throw new UnprocessableEntityException('Choose a DXF file to upload.');
    }
    return this.drawings.upload(user.id, {
      originalname: file.originalname,
      buffer: file.buffer,
      size: file.size,
    });
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<DrawingDto[]> {
    return this.drawings.list(user.id);
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DrawingDto> {
    return this.drawings.get(id, user.id);
  }

  @Get(':id/geometry')
  async geometry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ polylines: DrawingDto['polylines'] }> {
    const drawing = await this.drawings.get(id, user.id);
    return { polylines: drawing.polylines };
  }
}
