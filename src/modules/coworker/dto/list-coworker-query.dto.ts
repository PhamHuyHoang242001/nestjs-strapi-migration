import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CoworkerPackageStatus } from '@modules/databases/coworker-package.entity';

export class ListCoworkerQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  readonly page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit?: number = 20;

  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly search?: string;

  @ApiProperty({
    required: false,
    enum: CoworkerPackageStatus,
    description:
      'Default/omitted is active. inactive: workspace SO sees all; everyone else sees own/supporter packages only.',
  })
  @IsOptional()
  @IsEnum(CoworkerPackageStatus)
  readonly status?: CoworkerPackageStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  readonly publisher_id?: number;
}
