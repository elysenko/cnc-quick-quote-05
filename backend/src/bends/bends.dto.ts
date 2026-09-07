import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateBendDto {
  @IsNumber() sx!: number;
  @IsNumber() sy!: number;
  @IsNumber() ex!: number;
  @IsNumber() ey!: number;

  @IsNumber()
  @Min(0, { message: 'Bend angle must be between 0 and 180 degrees.' })
  @Max(180, { message: 'Bend angle must be between 0 and 180 degrees.' })
  angleDeg!: number;

  @IsIn(['up', 'down'], { message: 'Bend direction must be either up or down.' })
  direction!: 'up' | 'down';
}

export class UpdateBendDto {
  @IsOptional() @IsNumber() sx?: number;
  @IsOptional() @IsNumber() sy?: number;
  @IsOptional() @IsNumber() ex?: number;
  @IsOptional() @IsNumber() ey?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Bend angle must be between 0 and 180 degrees.' })
  @Max(180, { message: 'Bend angle must be between 0 and 180 degrees.' })
  angleDeg?: number;

  @IsOptional()
  @IsIn(['up', 'down'], { message: 'Bend direction must be either up or down.' })
  direction?: 'up' | 'down';
}
