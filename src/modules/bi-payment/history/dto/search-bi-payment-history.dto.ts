import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Strapi parity (IFindProgramHistory): programId + workstepCurrent + progressStatus + updatedByIds.
export class SearchBiPaymentProgramHistoryDto {
  @ApiProperty({ required: true })
  @IsInt()
  readonly programId: number;

  @ApiProperty({ required: false, description: 'ProgramWorkstep (display label or snake)' })
  @IsOptional()
  @IsString()
  readonly workstepCurrent?: string;

  @ApiProperty({ required: false, description: 'ProgramProgressStatus' })
  @IsOptional()
  @IsString()
  readonly progressStatus?: string;

  @ApiProperty({ required: false, description: 'Comma-separated updated-by ids' })
  @IsOptional()
  @IsString()
  readonly updatedByIds?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly keyword?: string;
}

// Strapi parity (IFindProjectHistory): projectId + updatedByIds.
export class SearchBiPaymentProjectHistoryDto {
  @ApiProperty({ required: true })
  @IsInt()
  readonly projectId: number;

  @ApiProperty({ required: false, description: 'Comma-separated updated-by ids' })
  @IsOptional()
  @IsString()
  readonly updatedByIds?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly keyword?: string;
}
