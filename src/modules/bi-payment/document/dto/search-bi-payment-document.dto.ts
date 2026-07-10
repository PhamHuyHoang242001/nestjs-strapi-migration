import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MaToolWorkstepType } from '@common/enums/ma-tool.enums';
import { BiPaymentWorkstepCurrent } from '@common/enums/bi-payment.enums';

// Strapi parity (IFindDocument): camelCase query keys. Base search (keyword/sortField/sortValue/
// page/limit) handled by @SortCamel + PaginationDecorator at controller.
// workstepCurrent filters the PROGRAM's workstep_current (not document_status).
// workstep filters the TEMPLATE's workstep_type. These are two distinct filters.
export class SearchBiPaymentDocumentDto {
  @ApiProperty({ required: false, description: 'Comma-separated template ids' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly templateIds?: string;

  @ApiProperty({ required: false, description: 'Free-text search (document_name OR notes ILIKE)' })
  @IsOptional()
  @IsString()
  readonly keyword?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly projectId?: string;

  @ApiProperty({ required: false, description: 'Program id (required by list-doc)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  readonly programId?: number;

  @ApiProperty({ required: false, description: 'Template version (filters template.version)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  readonly version?: number;

  @ApiProperty({ required: false, description: 'Comma-separated checklist ids (or "all")' })
  @IsOptional()
  @IsString()
  readonly checklistIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated created-by ids (filters uploaded_by_id)' })
  @IsOptional()
  @IsString()
  readonly createdByIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated updated-by ids (filters updated_by_id)' })
  @IsOptional()
  @IsString()
  readonly updatedByIds?: string;

  @ApiProperty({ required: false, description: 'Upload method (filters template.upload_method)' })
  @IsOptional()
  @IsString()
  readonly uploadMethod?: string;

  @ApiProperty({ required: false, description: 'Comma-separated approved-by ids (filters approved_by_id)' })
  @IsOptional()
  @IsString()
  readonly approvedByIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated rejected-by ids (filters rejected_by_id)' })
  @IsOptional()
  @IsString()
  readonly rejectedByIds?: string;

  @ApiProperty({
    required: false,
    description: "Program's current workstep (filters bi_payment_programs.workstep_current)",
    enum: BiPaymentWorkstepCurrent,
  })
  @IsOptional()
  @IsEnum(BiPaymentWorkstepCurrent)
  readonly workstepCurrent?: BiPaymentWorkstepCurrent;

  @ApiProperty({
    required: false,
    description: 'Workstep type (prepare | recon_data | recon_feedback | ex_prepare) — filters template.workstep_type',
    enum: MaToolWorkstepType,
  })
  @IsOptional()
  @IsEnum(MaToolWorkstepType)
  readonly workstep?: MaToolWorkstepType;

  @ApiProperty({ required: false, description: 'Document status (filters document_status)' })
  @IsOptional()
  @IsString()
  readonly status?: string;

  @ApiProperty({ required: false, description: 'Document created_at >= this date' })
  @IsOptional()
  @IsString()
  readonly startingDate?: string;

  @ApiProperty({ required: false, description: 'Document created_at <= this date' })
  @IsOptional()
  @IsString()
  readonly endingDate?: string;

  @ApiProperty({ required: false, description: 'Back date type (forces back_date_mode = true)' })
  @IsOptional()
  @IsString()
  readonly backDateType?: string;

  @ApiProperty({ required: false, description: 'Back date mode (ignored when backDateType is set)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  readonly backDateMode?: boolean;

  @ApiProperty({ required: false, description: 'S3 upload status (filters s3_upload_status)' })
  @IsOptional()
  @IsString()
  readonly s3UploadStatus?: string;
}
