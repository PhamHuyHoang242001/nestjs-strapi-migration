import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';
import { DataHubPageQueryDto, toNumberArray } from '../../common/data-hub-query.util';

// Tree list / export filter: free text plus "systems out" (consumer) intersection.
export class ListLogicalTermQueryDto extends DataHubPageQueryDto {
  @ApiProperty({
    required: false,
    type: [Number],
    description: 'Keep terms exposed to at least one of these consumers',
  })
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly consumer_ids?: number[];
}
