import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { ToSortType } from '@common/decorators/transforms.decorator';
import { SortType, SortTypeNumber } from '@common/enums';
import { PAGE_DEFAULT, PERPAGE_DEFAULT, PERPAGE_MAXIMUM, SORT_DEFAULT } from '../../constant';

export class PaginationDto {
  @ApiProperty({ default: PAGE_DEFAULT })
  @IsInt()
  @Type(() => Number)
  @Min(0)
  readonly skip?: number = PAGE_DEFAULT;

  @ApiProperty({ default: PAGE_DEFAULT })
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page: number = PAGE_DEFAULT;

  @ApiProperty({ default: PERPAGE_DEFAULT })
  @IsInt()
  @Type(() => Number)
  @Min(0)
  @Max(PERPAGE_MAXIMUM)
  limit: number = PERPAGE_DEFAULT;
}

export class SortDto<T = string> {
  @IsOptional()
  sort_field?: T;

  @ApiProperty({ enum: SortType, required: false })
  @IsOptional()
  @ToSortType()
  @IsEnum(SortType)
  sort_order?: SortType;
}

export class PaginationDtoAndSortDto extends PaginationDto {
  @ApiProperty({ required: false, default: SORT_DEFAULT })
  @IsOptional()
  sort_value?: string = SORT_DEFAULT;

  @ApiProperty({
    enum: SortType,
    required: false,
    default: SortType.DESC,
  })
  @IsOptional()
  @ToSortType()
  @IsEnum(SortTypeNumber)
  sort_direction?: SortTypeNumber = SortTypeNumber.DESC;
}
