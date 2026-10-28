import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { DataHubPageQueryDto, toNumberArray, toStringArray } from '../../common/data-hub-query.util';
import {
  DataHubApiMethod,
  DataHubApiUpdateFrequency,
  DataHubServiceType,
  DataHubSftpExportFrequency,
  DataHubSftpFileFormat,
  DataHubSftpFlowDirection,
} from '@modules/databases/data-hub-enums';

export const DATA_SERVICE_STATUS_FILTERS = ['active', 'inactive', 'all'] as const;
export const DATA_SERVICE_SORTS = ['newest', 'name', 'code'] as const;
export type DataServiceStatusFilter = (typeof DATA_SERVICE_STATUS_FILTERS)[number];
export type DataServiceSort = (typeof DATA_SERVICE_SORTS)[number];

const idArray = () => [IsOptional(), IsArray(), ArrayMaxSize(200), IsInt({ each: true }), Min(1, { each: true })];
const apply =
  (decorators: PropertyDecorator[]): PropertyDecorator =>
  (target, key) =>
    decorators.forEach((d) => d(target, key));

const enumArray = (values: object): PropertyDecorator =>
  apply([IsOptional(), IsArray(), ArrayMaxSize(50), IsEnum(values, { each: true })]);

// Catalog filters shared by the list and the export.
export class ListDataServiceQueryDto extends DataHubPageQueryDto {
  @ApiProperty({ required: false, enum: DataHubServiceType })
  @IsOptional()
  @IsEnum(DataHubServiceType)
  readonly service_type?: DataHubServiceType;

  @ApiProperty({ required: false, enum: DATA_SERVICE_STATUS_FILTERS, default: 'active' })
  @IsOptional()
  @IsIn(DATA_SERVICE_STATUS_FILTERS)
  readonly status?: DataServiceStatusFilter;

  // Named sort_by because BaseSearchDto.sort is an object; this is a fixed catalog ordering preset.
  @ApiProperty({ required: false, enum: DATA_SERVICE_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(DATA_SERVICE_SORTS)
  readonly sort_by?: DataServiceSort;

  @ApiProperty({ required: false, enum: DataHubApiMethod, isArray: true })
  @Transform(toStringArray)
  @enumArray(DataHubApiMethod)
  readonly methods?: DataHubApiMethod[];

  @ApiProperty({ required: false, enum: DataHubSftpFlowDirection, isArray: true })
  @Transform(toStringArray)
  @enumArray(DataHubSftpFlowDirection)
  readonly flow_directions?: DataHubSftpFlowDirection[];

  @ApiProperty({ required: false, enum: DataHubApiUpdateFrequency, isArray: true })
  @Transform(toStringArray)
  @enumArray(DataHubApiUpdateFrequency)
  readonly update_frequencies?: DataHubApiUpdateFrequency[];

  @ApiProperty({ required: false, enum: DataHubSftpExportFrequency, isArray: true })
  @Transform(toStringArray)
  @enumArray(DataHubSftpExportFrequency)
  readonly export_frequencies?: DataHubSftpExportFrequency[];

  @ApiProperty({ required: false, enum: DataHubSftpFileFormat, isArray: true })
  @Transform(toStringArray)
  @enumArray(DataHubSftpFileFormat)
  readonly file_formats?: DataHubSftpFileFormat[];

  @ApiProperty({ required: false, type: [Number] })
  @Transform(toNumberArray)
  @apply(idArray())
  readonly division_ids?: number[];

  @ApiProperty({ required: false, type: [Number] })
  @Transform(toNumberArray)
  @apply(idArray())
  readonly department_ids?: number[];

  @ApiProperty({ required: false, type: [Number] })
  @Transform(toNumberArray)
  @apply(idArray())
  readonly request_unit_ids?: number[];

  @ApiProperty({ required: false, type: [Number] })
  @Transform(toNumberArray)
  @apply(idArray())
  readonly consumer_ids?: number[];

  @ApiProperty({ required: false, type: [Number] })
  @Transform(toNumberArray)
  @apply(idArray())
  readonly logical_term_ids?: number[];

  @ApiProperty({ required: false, type: [Number] })
  @Transform(toNumberArray)
  @apply(idArray())
  readonly physical_term_ids?: number[];
}
