import { BaseSearchDto } from '@common/dto/common.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Strapi parity (IFindProject): camelCase query keys. keyword/sortField/sortValue/page/limit
// inherited from BaseSearchDto (Strapi IBaseSearch parity).
export class SearchBiPaymentProjectDto extends BaseSearchDto {
  @ApiProperty({ required: false, description: 'Comma-separated updated-by ids' })
  @IsOptional()
  @IsString()
  readonly updatedByIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated created-by ids' })
  @IsOptional()
  @IsString()
  readonly createdByIds?: string;

  @ApiProperty({ required: false, description: 'BICC department filter' })
  @IsOptional()
  @IsString()
  readonly biccDepartmentId?: string;

  @ApiProperty({ required: false, description: 'Project status filter' })
  @IsOptional()
  @IsString()
  readonly status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly isCreateProgram?: string;

  @ApiProperty({ required: false, description: 'Comma-separated program ids' })
  @IsOptional()
  @IsString()
  readonly programIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated category ids' })
  @IsOptional()
  @IsString()
  readonly categoryIds?: string;
}
