import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { DataHubPageQueryDto } from '../../common/data-hub-query.util';

// Picker of the data-service form: tables of the departments the caller is a member of; `data_service_id` (edit)
// also keeps the tables the service already holds terms in.
export class SelectableSourceTableQueryDto extends DataHubPageQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly data_service_id?: number;
}
