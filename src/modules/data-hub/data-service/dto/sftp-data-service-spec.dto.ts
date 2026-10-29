import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  DataHubSftpEncryption,
  DataHubSftpExportFrequency,
  DataHubSftpFileFormat,
  DataHubSftpFlowDirection,
} from '@modules/databases/data-hub-enums';
import { numberToString, trimString } from './data-service-dto-transforms';

export class SftpDataServiceSpecDto {
  @ApiProperty({ required: false, maxLength: 1000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  readonly folder_path?: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  readonly file_name_pattern?: string;

  @ApiProperty({ enum: DataHubSftpFileFormat })
  @IsEnum(DataHubSftpFileFormat)
  readonly file_format: DataHubSftpFileFormat;

  @ApiProperty({ enum: DataHubSftpExportFrequency })
  @IsEnum(DataHubSftpExportFrequency)
  readonly export_frequency: DataHubSftpExportFrequency;

  @ApiProperty({ required: false, maxLength: 255 })
  @IsOptional()
  @Transform(numberToString)
  @IsString()
  @MaxLength(255)
  readonly max_file_size?: string;

  @ApiProperty({ enum: DataHubSftpEncryption })
  @IsEnum(DataHubSftpEncryption)
  readonly encryption: DataHubSftpEncryption;

  @ApiProperty({ required: false, enum: DataHubSftpFlowDirection })
  @IsOptional()
  @IsEnum(DataHubSftpFlowDirection)
  readonly flow_direction?: DataHubSftpFlowDirection;
}
