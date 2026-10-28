import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { CreateDataServiceDto } from './create-data-service.dto';
import { DataServiceSourceTableInputDto } from './data-service-source-table.dto';

// Edit sends the full new state; the service type is fixed at creation.
export class UpdateDataServiceDto extends OmitType(CreateDataServiceDto, ['service_type', 'source_tables'] as const) {
  // Required on edit: the service's terms left out are soft-deleted, so a missing field must not wipe them.
  @ApiProperty({ type: [DataServiceSourceTableInputDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DataServiceSourceTableInputDto)
  readonly source_tables: DataServiceSourceTableInputDto[];
}
