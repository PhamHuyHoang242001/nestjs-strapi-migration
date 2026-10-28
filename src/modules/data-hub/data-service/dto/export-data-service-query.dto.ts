import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';
import { toNumberArray } from '../../common/data-hub-query.util';
import { ListDataServiceQueryDto } from './list-data-service-query.dto';

// Same filters as the list; paging is ignored, `ids` narrows the export to chosen rows.
export class ExportDataServiceQueryDto extends ListDataServiceQueryDto {
  @ApiProperty({ required: false, type: [Number] })
  @Transform(toNumberArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly ids?: number[];
}
