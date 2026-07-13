import { BaseSearchDto } from '@common/dto/common.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

// Strapi parity (IFindProgramHistory): programId + workstepCurrent + progressStatus + updatedByIds.
// keyword/sortField/sortValue/page/limit inherited from BaseSearchDto (Strapi IBaseSearch parity).
export class SearchBiPaymentProgramHistoryDto extends BaseSearchDto {
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
}

// Strapi parity (IFindProjectHistory): projectId + updatedByIds.
// keyword/sortField/sortValue/page/limit inherited from BaseSearchDto (Strapi IBaseSearch parity).
export class SearchBiPaymentProjectHistoryDto extends BaseSearchDto {
  @ApiProperty({ required: true })
  @IsInt()
  readonly projectId: number;

  @ApiProperty({ required: false, description: 'Comma-separated updated-by ids' })
  @IsOptional()
  @IsString()
  readonly updatedByIds?: string;
}
