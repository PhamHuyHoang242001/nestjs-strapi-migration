import { BaseSearchDto } from '@common/dto/common.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Strapi parity (IFindAllOtherFile): camelCase query keys. programId + type required trong Strapi.
// keyword/sortField/sortValue/page/limit inherited from BaseSearchDto (Strapi IBaseSearch parity).
export class SearchBiPaymentOtherFileDto extends BaseSearchDto {
  @ApiProperty({ required: true, description: 'Program scope anchor' })
  @IsInt()
  readonly programId: number;

  @ApiProperty({ required: false, description: 'Comma-separated checklist ids' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly checkListIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated document ids' })
  @IsOptional()
  @IsString()
  readonly documentIds?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  readonly startingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  readonly endingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  readonly version?: number;

  @ApiProperty({ required: false, description: 'Comma-separated created-by ids' })
  @IsOptional()
  @IsString()
  readonly createdByIds?: string;

  @ApiProperty({ required: false, description: 'WorkStepBI type filter' })
  @IsOptional()
  @IsString()
  readonly type?: string;
}
