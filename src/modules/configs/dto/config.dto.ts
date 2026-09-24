import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Sortable columns exposed to clients, mapped to real entity columns. */
export const CONFIG_SORT_MAP: Record<string, string> = {
  id: 'id',
  key: 'key',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

export class ListConfigDto {
  @ApiPropertyOptional({ description: 'Search by key or value (partial, case-insensitive)' })
  @IsOptional()
  @IsString()
  keyword?: string = '';

  @ApiPropertyOptional({ description: 'Sort field: id | key | createdAt | updatedAt', default: 'id' })
  @IsOptional()
  @IsString()
  @IsIn(Object.keys(CONFIG_SORT_MAP))
  sortField?: string = 'id';

  @ApiPropertyOptional({ description: 'Sort direction', default: 'DESC', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortValue?: string = 'DESC';

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class CreateConfigDto {
  @ApiProperty({ description: 'Unique config key', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly key: string;

  @ApiPropertyOptional({ description: 'Config value (any JSON-serializable value)' })
  @IsOptional()
  readonly value?: unknown;
}

export class UpdateConfigDto {
  @ApiPropertyOptional({ description: 'Unique config key', maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly key?: string;

  @ApiPropertyOptional({ description: 'Config value (any JSON-serializable value); null clears it' })
  @IsOptional()
  readonly value?: unknown;
}
