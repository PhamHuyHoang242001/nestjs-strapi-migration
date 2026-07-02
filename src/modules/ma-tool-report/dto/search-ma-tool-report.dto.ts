import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, IsNumberString } from 'class-validator';

// Query params for GET /ma-tool/report
export class SearchMaToolReportDto {
  @ApiProperty({ required: false, description: 'Matches rpt_code / rpt_owner' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly keyword?: string;

  @ApiProperty({ required: false, description: 'Page number (default 1)' })
  @IsOptional()
  @IsNumberString()
  readonly page?: string;

  @ApiProperty({ required: false, description: 'Items per page (default 10, max 100)' })
  @IsOptional()
  @IsNumberString()
  readonly limit?: string;
}
