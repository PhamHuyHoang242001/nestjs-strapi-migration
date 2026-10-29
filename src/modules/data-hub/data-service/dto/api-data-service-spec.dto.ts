import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import {
  DataHubApiAuthType,
  DataHubApiBaseUrl,
  DataHubApiMethod,
  DataHubApiSyncMode,
  DataHubApiUpdateFrequency,
} from '@modules/databases/data-hub-enums';
import { numberToString, trimString } from './data-service-dto-transforms';

const hasValue = (v: unknown): boolean => v !== undefined && v !== null && v !== '';

export class ApiDataServiceSpecDto {
  @ApiProperty({ enum: DataHubApiMethod })
  @IsEnum(DataHubApiMethod)
  readonly method: DataHubApiMethod;

  @ApiProperty({ enum: DataHubApiBaseUrl })
  @IsEnum(DataHubApiBaseUrl)
  readonly base_url: DataHubApiBaseUrl;

  @ApiProperty({ maxLength: 1000 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  readonly endpoint_path: string;

  @ApiProperty({ enum: DataHubApiAuthType })
  @IsEnum(DataHubApiAuthType)
  readonly auth_type: DataHubApiAuthType;

  @ApiProperty({ required: false, maxLength: 255 })
  @IsOptional()
  @Transform(numberToString)
  @IsString()
  @MaxLength(255)
  readonly peak_tps?: string;

  @ApiProperty({ enum: DataHubApiUpdateFrequency })
  @IsEnum(DataHubApiUpdateFrequency)
  readonly update_frequency: DataHubApiUpdateFrequency;

  @ApiProperty({ enum: DataHubApiSyncMode })
  @IsEnum(DataHubApiSyncMode)
  readonly sync_mode: DataHubApiSyncMode;

  // A synchronous call must declare its timeout; an async call may leave it empty.
  @ApiProperty({ required: false, maxLength: 100, description: 'Required when sync_mode = SYNC' })
  @ValidateIf((o: ApiDataServiceSpecDto) => o.sync_mode === DataHubApiSyncMode.SYNC || hasValue(o.timeout))
  @Transform(numberToString)
  @IsString()
  @IsNotEmpty({ message: 'timeout is required when sync_mode is SYNC' })
  @MaxLength(100)
  readonly timeout?: string;

  @ApiProperty({ required: false, description: 'Any JSON value' })
  @IsOptional()
  readonly sample_request?: unknown;

  @ApiProperty({ required: false, description: 'Any JSON value' })
  @IsOptional()
  readonly sample_response?: unknown;
}
