import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString } from 'class-validator';

// Query params for GET /admin/diagnostic/report/download
export class DownloadDiagnosticReportDto {
  @ApiProperty({ required: true, description: 'ALL | MULTIPLE' })
  @IsString()
  readonly download_type: string;

  @ApiProperty({ required: false, description: 'Comma-separated IDs (for MULTIPLE)' })
  @IsOptional()
  @IsString()
  readonly ids?: string;

  @ApiProperty({ required: false, description: 'BICC department ID — required when download_type=ALL' })
  @IsOptional()
  @IsNumberString()
  readonly biccDepartmentId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly keyword?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly sortField?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly sortValue?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  readonly isDeleted?: string;
}
