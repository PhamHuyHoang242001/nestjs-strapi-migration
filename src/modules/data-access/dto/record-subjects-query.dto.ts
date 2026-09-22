import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordSubjectsQueryDto {
  @ApiProperty({ description: 'Child table being created', example: 'bi_hub_reports' })
  @IsString()
  @IsNotEmpty()
  table: string;

  @ApiProperty({ description: 'Parent record id', example: 5 })
  @IsInt()
  @Type(() => Number)
  data_id: number;

  @ApiPropertyOptional({ description: 'Keyword: role name or user email' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  search?: string;
}
