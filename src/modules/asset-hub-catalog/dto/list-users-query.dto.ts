import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Query DTO for GET /v1/asset-hub/users — the person-in-charge picker.
// The picker browses the whole directory, so `search` narrows an already-paginated list rather
// than being a precondition for results. limit is capped at 100, matching the item list DTOs.
export class ListUsersQueryDto {
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

  @ApiProperty({ required: false, description: 'Optional keyword matched against email', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly search?: string;
}
