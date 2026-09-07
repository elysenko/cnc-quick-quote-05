import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdatePricingDto {
  @Type(() => Number) @IsNumber() @Min(0) setupFee!: number;
  @Type(() => Number) @IsNumber() @Min(0) costPerLinearFoot!: number;
  @Type(() => Number) @IsNumber() @Min(0) perSheetCost!: number;
  @Type(() => Number) @IsNumber() @Min(0) handlingFee!: number;
  @Type(() => Number) @IsNumber() @Min(0) costPerBend!: number;
  @Type(() => Number) @IsNumber() @Min(0) minimumOrder!: number;
}

export class UpdateMachineDto {
  @Type(() => Number) @IsInt() @Min(1) minQuantity!: number;
  @Type(() => Number) @IsInt() @Min(1) maxQuantity!: number;
  @Type(() => Number) @IsInt() @Min(1024) maxUploadBytes!: number;
  @IsArray() @IsString({ each: true }) allowedExtensions!: string[];
  @Type(() => Number) @IsNumber() @Min(0) sheetSpacingMm!: number;
  @Type(() => Number) @IsNumber() @Min(0) sheetMarginMm!: number;
  @Type(() => Number) @IsNumber() @Min(1) animationSpeed!: number;
}

export class UpdateBusinessDto {
  @IsOptional() @IsString() @MaxLength(160) companyName?: string;
  @IsOptional() @IsString() @MaxLength(200) supportEmail?: string;
  @IsOptional() @IsString() @MaxLength(60) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) region?: string;
  @IsOptional() @IsString() @MaxLength(40) postcode?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() @MaxLength(40) primaryColor?: string;
  @IsOptional() @IsString() @MaxLength(40) accentColor?: string;
  @IsOptional() @IsBoolean() stripeSandbox?: boolean;
  @IsOptional() @IsString() @MaxLength(300) stripePublishableKey?: string;
  /** Write-only: blank leaves the stored secret untouched. */
  @IsOptional() @IsString() @MaxLength(300) stripeSecretKey?: string;
  @IsOptional() @IsString() @MaxLength(300) stripeWebhookSecret?: string;
}

export class CreateShippingMethodDto {
  @IsString() @MinLength(1, { message: 'Enter a name for this shipping method.' }) @MaxLength(120)
  name!: string;

  @IsIn(['flat', 'per_sheet'], { message: 'Shipping is charged either flat or per sheet.' })
  kind!: 'flat' | 'per_sheet';

  @Type(() => Number) @IsNumber() @Min(0, { message: 'Rate cannot be negative.' })
  rate!: number;

  @Type(() => Number) @IsInt() @Min(0, { message: 'Estimated days cannot be negative.' })
  estDays!: number;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateShippingMethodDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['flat', 'per_sheet']) kind?: 'flat' | 'per_sheet';
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) estDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSettingsDto {
  @IsArray()
  entries!: Array<{ key: string; value: string }>;
}
