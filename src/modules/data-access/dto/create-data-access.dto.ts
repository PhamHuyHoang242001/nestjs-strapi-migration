import { SCOPE_TYPE } from '@common/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDataAccessDto {
  @ApiPropertyOptional({ description: 'User IDs for user-specific exception rules', type: [Number], example: [1, 2] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  user_ids?: number[];

  @ApiPropertyOptional({ description: 'Role IDs for role-based rules', type: [Number], example: [1, 3] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  role_ids?: number[];

  @ApiProperty({ description: 'ID of the record to control access on', example: 42 })
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  data_id: number;

  @ApiProperty({ description: 'Table containing the controlled record', example: 'bi_hub_reports' })
  @IsString()
  @IsNotEmpty()
  table_name: string;

  @ApiProperty({ description: 'Access scope: allow or deny', enum: SCOPE_TYPE, example: SCOPE_TYPE.ALLOW })
  @IsEnum(SCOPE_TYPE)
  @IsNotEmpty()
  scope_type: SCOPE_TYPE;

  @ApiPropertyOptional({ description: 'Rule effective start date', example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  start_date?: Date;

  @ApiPropertyOptional({ description: 'Rule effective end date', example: '2024-12-31T23:59:59Z' })
  @IsOptional()
  end_date?: Date;

  @ApiPropertyOptional({
    description: 'Permission IDs for M:N junction (data_permissions)',
    type: [Number],
    example: [1, 2],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  permission_ids?: number[];
}
