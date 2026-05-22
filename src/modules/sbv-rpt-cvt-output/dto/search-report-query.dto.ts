import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SearchReportQueryDto {
  @ApiProperty({ description: 'Report date: YYYY-MM-DD or YYYY-MM', required: true })
  @IsNotEmpty()
  @IsString()
  reportDate: string;

  @ApiProperty({ required: false, description: 'Frequency code: D, M, Q, Y, M3, Y2' })
  @IsOptional()
  @IsString()
  frq_code?: string;

  @ApiProperty({ required: false, description: 'Comma-separated report codes' })
  @IsOptional()
  @IsString()
  rptCode?: string;

  @ApiProperty({ required: false, description: 'Comma-separated branch codes' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ required: false, description: '"true" to filter old version reports' })
  @IsOptional()
  @IsString()
  isOldVersion?: string;

  @ApiProperty({ required: false, description: 'Start date for old version filter (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'End date for old version filter (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ required: false, description: '"true" to include nil (no-data) reports' })
  @IsOptional()
  @IsString()
  onlyNoData?: string;
}
