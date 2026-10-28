import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional } from 'class-validator';
import { DataHubConsumerCategory, DataHubServiceType } from '@modules/databases/data-hub-enums';
import { DataHubPageQueryDto, toNumberArray } from '../../common/data-hub-query.util';

export class ListConsumerQueryDto extends DataHubPageQueryDto {
  @ApiProperty({ required: false, enum: DataHubConsumerCategory })
  @IsOptional()
  @IsEnum(DataHubConsumerCategory)
  readonly category?: DataHubConsumerCategory;

  @ApiProperty({ required: false, enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  readonly status?: 'active' | 'inactive' | 'all';

  @ApiProperty({ required: false, type: [Number] })
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  readonly division_ids?: number[];

  @ApiProperty({ required: false, type: [Number] })
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  readonly logical_term_ids?: number[];

  @ApiProperty({ required: false, enum: DataHubServiceType })
  @IsOptional()
  @IsEnum(DataHubServiceType)
  readonly connection_type?: DataHubServiceType;
}
