import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum ReviewScope {
  ALL = 'all',
  MINE = 'mine',
}

// Query DTO for GET /v1/skill/reviews.
// Non-approvers have the scope forcibly overridden to 'mine' in the service (C3).
export class ReviewQueryDto {
  @ApiProperty({ required: false, enum: ReviewScope, default: ReviewScope.MINE })
  @IsOptional()
  @IsEnum(ReviewScope)
  readonly scope?: ReviewScope = ReviewScope.MINE;

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
}
