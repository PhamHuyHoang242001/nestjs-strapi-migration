import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';
import { DataHubPageQueryDto, toNumberArray } from '../../common/data-hub-query.util';

// Dictionary "Thuật ngữ nghiệp vụ" tab: a table matches when one of its Đơn vị phát hành / Khối chủ quản
// (the badges of the row) is in the list.
export class ListSourceTableQueryDto extends DataHubPageQueryDto {
  @ApiProperty({ required: false, type: [Number] })
  @Transform(toNumberArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly department_ids?: number[];

  @ApiProperty({ required: false, type: [Number] })
  @Transform(toNumberArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly division_ids?: number[];
}
