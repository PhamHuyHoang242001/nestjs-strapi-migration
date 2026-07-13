import { BaseSearchDto } from '@common/dto/common.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Search category — keyword/page/limit/sort inherited from BaseSearchDto (Strapi IBaseSearch
// parity). ids filters by ids (comma-separated string → int[]).
export class SearchBiPaymentCategoryDto extends BaseSearchDto {
  @ApiProperty({ required: false, description: 'Comma-separated ids' })
  @IsOptional()
  @IsString()
  readonly ids?: string;
}
