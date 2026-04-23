import { SCOPE_TYPE } from '@common/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBulkDataAccessDto {
  @ApiProperty({ description: 'IDs of records to control access on', type: [Number], example: [1, 2, 3] })
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => Number)
  data_ids: number[];

  @ApiProperty({ description: 'Table containing the controlled records', example: 'ma_tool_documents' })
  @IsString()
  @IsNotEmpty()
  table_name: string;

  @ApiProperty({ description: 'Access scope: allow or deny', enum: SCOPE_TYPE, example: SCOPE_TYPE.ALLOW })
  @IsEnum(SCOPE_TYPE)
  @IsNotEmpty()
  scope_type: SCOPE_TYPE;

  @ApiPropertyOptional({ description: 'User IDs for user-specific rules', type: [Number], example: [1, 2] })
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

  @ApiPropertyOptional({ description: 'Permission IDs for M:N junction', type: [Number], example: [1, 2] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  permission_ids?: number[];

  @ApiPropertyOptional({ description: 'Rule effective start date', example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  start_date?: Date;

  @ApiPropertyOptional({ description: 'Rule effective end date', example: '2024-12-31T23:59:59Z' })
  @IsOptional()
  end_date?: Date;
}
