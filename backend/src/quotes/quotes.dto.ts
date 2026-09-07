import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateQuoteDto {
  @IsUUID(undefined, { message: 'Choose a drawing to quote.' })
  drawingId!: string;

  @IsUUID(undefined, { message: 'Choose a material.' })
  materialId!: string;

  @Type(() => Number)
  @IsInt({ message: 'Quantity must be a whole number of parts.' })
  @Min(1, { message: 'Quantity must be at least one part.' })
  quantity!: number;
}

export class ListQuotesDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}
