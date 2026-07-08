import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Strapi parity (IFindDocument): camelCase query keys. Base search (keyword/sortField/sortValue/
// page/limit) handled by @SortCamel + PaginationDecorator at controller.
export class SearchBiPaymentDocumentDto {
  @ApiProperty({ required: false, description: 'Comma-separated template ids' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly templateIds?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly projectId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly programId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  readonly version?: number;

  @ApiProperty({ required: false, description: 'Comma-separated checklist ids' })
  @IsOptional()
  @IsString()
  readonly checklistIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated created-by ids' })
  @IsOptional()
  @IsString()
  readonly createdByIds?: string;

  @ApiProperty({ required: false, description: 'Upload method' })
  @IsOptional()
  @IsString()
  readonly uploadMethod?: string;

  @ApiProperty({ required: false, description: 'Comma-separated updated-by ids' })
  @IsOptional()
  @IsString()
  readonly updatedByIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated approved-by ids' })
  @IsOptional()
  @IsString()
  readonly approvedByIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated rejected-by ids' })
  @IsOptional()
  @IsString()
  readonly rejectedByIds?: string;

  @ApiProperty({ required: false, description: 'Workstep current' })
  @IsOptional()
  @IsString()
  readonly workstepCurrent?: string;

  @ApiProperty({ required: false, description: 'Workstep type (EworkstepType)' })
  @IsOptional()
  @IsString()
  readonly workstep?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly startingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly endingDate?: string;

  @ApiProperty({ required: false, description: 'Back date type' })
  @IsOptional()
  @IsString()
  readonly backDateType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  readonly backDateMode?: boolean;

  @ApiProperty({ required: false, description: 'Validate mode' })
  @IsOptional()
  @IsString()
  readonly validateMode?: string;

  @ApiProperty({ required: false, description: 'S3 upload status' })
  @IsOptional()
  @IsString()
  readonly s3UploadStatus?: string;
}
