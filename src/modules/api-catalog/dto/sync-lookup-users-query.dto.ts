import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Query for GET /v1/ai-hub/api-catalog/sync/users. limit capped at 100 (the users table is large).
export class SyncLookupUsersQueryDto {
  @ApiProperty({ required: false, description: 'Substring of email or full name (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly search?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page?: number = 1;

  @ApiProperty({ required: false, default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit?: number = 50;
}
