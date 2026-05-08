import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, IsNumberString } from 'class-validator';

// Query params for GET /bi-hub/diagnostic-report — matches Strapi FE exactly
export class SearchDiagnosticReportDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly keyword?: string;

  @ApiProperty({ required: false, description: 'createdAt | total_view | updatedAt' })
  @IsOptional()
  @IsString()
  readonly sortField?: string;

  @ApiProperty({ required: false, description: 'ASC | DESC' })
  @IsOptional()
  @IsString()
  readonly sortValue?: string;

  @ApiProperty({ required: false, description: 'Page number (default 1)' })
  @IsOptional()
  @IsNumberString()
  readonly page?: string;

  @ApiProperty({ required: false, description: 'Items per page (default 10)' })
  @IsOptional()
  @IsNumberString()
  readonly limit?: string;

  @ApiProperty({ required: false, description: 'BICC department ID (was reportCategoryId)' })
  @IsOptional()
  @IsNumberString()
  readonly reportCategoryId?: string;

  @ApiProperty({ required: false, description: 'Comma-separated label IDs' })
  @IsOptional()
  @IsString()
  readonly labelIds?: string;

  @ApiProperty({ required: false, description: 'active | inactive' })
  @IsOptional()
  @IsString()
  readonly reportStatus?: string;
}
