import { SCOPE_TYPE } from '@common/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class SearchDataAccessDto {
  @ApiPropertyOptional({ description: 'Search by data_id, role name, or user full_name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by table name (partial match)' })
  @IsOptional()
  @IsString()
  table_name?: string;

  @ApiPropertyOptional({ description: 'Filter by scope type', enum: SCOPE_TYPE })
  @IsOptional()
  @IsEnum(SCOPE_TYPE)
  scope_type?: SCOPE_TYPE;

  @ApiPropertyOptional({ description: 'Filter by role ID' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  role_id?: number;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  user_id?: number;

  @ApiPropertyOptional({
    description: 'Filter by subject type: "role" = role-based rules only, "user" = user-specific rules only',
    enum: ['role', 'user'],
  })
  @IsOptional()
  @IsString()
  subject_type?: 'role' | 'user';
}
