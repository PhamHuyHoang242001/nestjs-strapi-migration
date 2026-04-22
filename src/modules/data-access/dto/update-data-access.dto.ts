import { SCOPE_TYPE } from '@common/enums';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional } from 'class-validator';

/**
 * Mutable fields for updating a data access rule.
 * data_id and table_name are immutable —
 * to change them, soft-delete the old record and create a new one.
 */
export class UpdateDataAccessDto {
  @ApiPropertyOptional({ description: 'Access scope: allow or deny', enum: SCOPE_TYPE })
  @IsOptional()
  @IsEnum(SCOPE_TYPE)
  scope_type?: SCOPE_TYPE;

  @ApiPropertyOptional({ description: 'Rule effective start date', example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  start_date?: Date;

  @ApiPropertyOptional({ description: 'Rule effective end date', example: '2024-12-31T23:59:59Z' })
  @IsOptional()
  end_date?: Date;

  @ApiPropertyOptional({ description: 'User IDs (replaces existing)', type: [Number], example: [1, 2] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  user_ids?: number[];

  @ApiPropertyOptional({ description: 'Role IDs (replaces existing)', type: [Number], example: [1, 3] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  role_ids?: number[];

  @ApiPropertyOptional({ description: 'Permission IDs for M:N junction (data_permissions)', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  permission_ids?: number[];
}
