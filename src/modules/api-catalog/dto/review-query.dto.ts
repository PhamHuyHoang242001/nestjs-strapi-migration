import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const REVIEW_SORTS = ['newest', 'oldest', 'name'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

// Query DTO for GET /v1/api-catalog/reviews.
// Visibility is derived from the caller's permissions (approver = all pending, else own
// submitted). submitted_by / category_id / sort are display filters and never widen that.
export class ReviewQueryDto {
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

  @ApiProperty({ required: false, description: 'Filter by pending-version submitter user id' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  readonly submitted_by?: number;

  @ApiProperty({ required: false, description: 'Filter by category ID' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  readonly category_id?: number;

  @ApiProperty({ required: false, enum: REVIEW_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(REVIEW_SORTS as unknown as string[])
  readonly sort?: ReviewSort = 'newest';
}
