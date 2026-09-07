import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateMaterialDto {
  @IsString() @MinLength(1, { message: 'Enter a material name.' }) @MaxLength(120)
  name!: string;

  @Type(() => Number) @IsNumber() @Min(0.01, { message: 'Thickness must be greater than zero.' })
  thicknessMm!: number;

  @Type(() => Number) @IsNumber() @Min(1, { message: 'Sheet width must be greater than zero.' })
  sheetWMm!: number;

  @Type(() => Number) @IsNumber() @Min(1, { message: 'Sheet height must be greater than zero.' })
  sheetHMm!: number;

  @Type(() => Number) @IsNumber() @Min(0, { message: 'Cost multiplier cannot be negative.' })
  costMultiplier!: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) thicknessMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) sheetWMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) sheetHMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) costMultiplier?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
