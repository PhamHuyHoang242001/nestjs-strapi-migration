import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SkillCategory } from '../skill-category.constant';
import { SkillPackageStatus } from '@modules/databases/skill-package.entity';

// Query DTO for GET /v1/skill/items.
// limit is capped at 100 (M2 — uncapped limit is a DoS risk on large tables).
// Filters are parameter-bound in the service (never string-concatenated into SQL).
export class ListSkillQueryDto {
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

  @ApiProperty({ required: false, description: 'Search keyword (matches name or description)', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly search?: string;

  @ApiProperty({ required: false, description: 'Filter by category', enum: SkillCategory })
  @IsOptional()
  @IsEnum(SkillCategory)
  readonly category?: SkillCategory;

  @ApiProperty({
    required: false,
    description:
      'Filter by package status. inactive is only honored for approvers; other callers are always scoped to active.',
    enum: SkillPackageStatus,
  })
  @IsOptional()
  @IsEnum(SkillPackageStatus)
  readonly status?: SkillPackageStatus;

  @ApiProperty({ required: false, description: 'Filter by tags (comma-separated or array)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    // Accept comma-separated string or array from query string.
    const arr = Array.isArray(value) ? value : String(value).split(',');
    return arr.map((t: string) => String(t).trim().substring(0, 100)).filter((t) => t.length > 0);
  })
  readonly tags?: string[];
}
