import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SkillCategory } from '../skill-category.constant';
import { SkillVersionState } from '@modules/databases/skill-version.entity';

// Query DTO for GET /v1/skill/my-items — caller's own packages bucketed by the LATEST version's
// state. `status` is REQUIRED: the endpoint always returns exactly one lifecycle bucket of the
// caller's packages, keyed on the newest non-deleted version:
//   pending  → newest version still awaiting review (not yet approved)
//   approved → newest version approved
//   rejected → newest version rejected
// Filtering + pagination run entirely in SQL; search/category narrow within the chosen bucket.
export class MyItemsQueryDto {
  @ApiProperty({ description: 'Lifecycle bucket, matched against the latest version state', enum: SkillVersionState })
  @IsEnum(SkillVersionState)
  readonly status: SkillVersionState;

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
