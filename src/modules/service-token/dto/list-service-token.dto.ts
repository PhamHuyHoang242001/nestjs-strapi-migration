import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Query for listing service tokens. Mirrors the data-self-serve request list shape:
 * DTO-based keyword + pagination (page/limit) + sort (sortField/sortValue).
 */
export class ListServiceTokenDto {
  @ApiPropertyOptional({ description: 'Search by token name (partial, case-insensitive)' })
  @IsOptional()
  @IsString()
  keyword?: string = '';

  @ApiPropertyOptional({ description: 'Sort field: id | name', default: 'id' })
  @IsOptional()
  @IsString()
  sortField?: string = 'id';

  @ApiPropertyOptional({ description: 'Sort direction', default: 'DESC', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortValue?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;
}
