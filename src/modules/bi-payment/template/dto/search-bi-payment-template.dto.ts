import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Strapi parity (IFindTemplate): camelCase query keys. programId required
// (step×program scope anchor). Optional filters mirror Strapi findTemplateV2.
export class SearchBiPaymentTemplateDto {
  @ApiPropertyOptional({ description: 'Required — step×program scope anchor' })
  @Transform(({ value }) => (value === undefined || value === '' || value === null ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  programId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' || value === null ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  projectId?: number;

  // workstepType: single value or csv (Strapi V2 accepts csv). Narrow the
  // allowed step set; values outside the caller's allowed set → 403.
  @ApiPropertyOptional({ description: 'csv or single: prepare,recon_data,recon_feedback,ex_prepare' })
  @IsOptional()
  @IsString()
  workstepType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' || value === null ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  version?: number;

  @ApiPropertyOptional({ description: 'csv user ids' })
  @IsOptional()
  @IsString()
  createdByIds?: string;

  @ApiPropertyOptional({ description: 'csv user ids' })
  @IsOptional()
  @IsString()
  updatedByIds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;
}
