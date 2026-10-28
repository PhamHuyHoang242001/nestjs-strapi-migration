import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DataHubServiceType } from '@modules/databases/data-hub-enums';
import { ApiDataServiceSpecDto } from './api-data-service-spec.dto';
import { trimString } from './data-service-dto-transforms';
import { DataServiceSourceTableInputDto } from './data-service-source-table.dto';
import { SftpDataServiceSpecDto } from './sftp-data-service-spec.dto';

export class CreateDataServiceDto {
  @ApiProperty({ enum: DataHubServiceType })
  @IsEnum(DataHubServiceType)
  readonly service_type: DataHubServiceType;

  @ApiProperty({ maxLength: 90 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(90)
  readonly name: string;

  @ApiProperty({ maxLength: 400 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  readonly short_description: string;

  @ApiProperty({ required: false, maxLength: 1000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  readonly purpose?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  readonly request_unit_id: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  readonly division_id: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  readonly department_id: number;

  // Optional: an empty guide is stored as ''.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500000)
  readonly usage_guide_html?: string;

  @ApiProperty({ type: [Number], description: '1..20 active consumers' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly consumer_ids: number[];

  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly requester_user_ids: number[];

  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly it_supporter_user_ids: number[];

  // Full desired set of the service's source tables and physical terms; terms left out are soft-deleted.
  @ApiProperty({ required: false, type: [DataServiceSourceTableInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DataServiceSourceTableInputDto)
  readonly source_tables?: DataServiceSourceTableInputDto[];

  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  readonly changelog_note?: string;

  @ApiProperty({ required: false, type: ApiDataServiceSpecDto, description: 'Required when service_type = API' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ApiDataServiceSpecDto)
  readonly api_spec?: ApiDataServiceSpecDto;

  @ApiProperty({ required: false, type: SftpDataServiceSpecDto, description: 'Required when service_type = SFTP' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SftpDataServiceSpecDto)
  readonly sftp_spec?: SftpDataServiceSpecDto;
}
