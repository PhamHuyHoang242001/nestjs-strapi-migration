import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPackageStatus } from '@modules/databases/api-catalog-package.entity';
import { ApiHttpMethod } from '@modules/databases/api-catalog-version.entity';

// Query DTO for GET /v1/api-catalog/items.
// limit is capped at 100 (uncapped limit is a DoS risk on large tables).
// Filters are parameter-bound in the service (never string-concatenated into SQL).
// Tag matching lives inside `search` (substring on catalog tag name) — there is no
// discrete tag_ids / kind list filter.
export class ListApiQueryDto {
  @ApiProperty({ required: false, description: 'Filter by category ID' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  readonly category_id?: number;
  @ApiProperty({ required: false, description: 'Page number', default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  readonly page?: number = 1;

  @ApiProperty({ required: false, description: 'Items per page (max 100)', default: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit?: number = 20;

  @ApiProperty({
    required: false,
    description: 'Keyword matching name, short description, or catalog tag name (substring, case-insensitive)',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly search?: string;

  @ApiProperty({
    required: false,
    description:
      'Filter by package status. inactive is only honored for approvers; other callers are always scoped to active.',
    enum: ApiPackageStatus,
  })
  @IsOptional()
  @IsEnum(ApiPackageStatus)
  readonly status?: ApiPackageStatus;

  @ApiProperty({ required: false, description: 'Filter by khối chủ quản ID' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  readonly publisher_id?: number;

  @ApiProperty({ required: false, enum: ApiHttpMethod })
  @IsOptional()
  @IsEnum(ApiHttpMethod)
  readonly http_method?: ApiHttpMethod;
}
