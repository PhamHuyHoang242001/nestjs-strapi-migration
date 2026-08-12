import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SkillCategory } from '../skill-category.constant';

// Query DTO for GET /v1/skill/my-items — caller's own packages across all statuses.
// Mirrors ListSkillQueryDto's page/limit/search/category guards (no tags filter here).
// Filters are applied in-memory against the resolved representative version (its name/category
// live on skill_versions, not skill_packages), so they are never string-concatenated into SQL.
export class MyItemsQueryDto {
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
}
