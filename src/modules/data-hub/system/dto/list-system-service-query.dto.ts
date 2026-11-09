import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { DataHubPageQueryDto } from '../../common/data-hub-query.util';

// keyword / page / limit from the base DTO, plus the system the services belong to (the cascading select).
export class ListSystemServiceQueryDto extends DataHubPageQueryDto {
  @ApiProperty({ required: false, description: 'Only services of this Hệ thống' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly system_id?: number;
}
