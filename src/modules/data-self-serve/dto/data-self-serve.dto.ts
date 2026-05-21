import {
  DataSelfServeRequestGroup,
  DataSelfServeRequestStatus,
  DataSelfServeStorageType,
  DataSelfServeUploadMethod,
} from '@common/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export enum DataSelfServeScopeType {
  CLIENT_NO = 'client_no',
  LOAN_NO = 'loan_no',
  BOOK = 'book',
  DAO = 'dao',
  SEGMENT = 'segment',
  INDUSTRY = 'industry',
}

export const MANUAL_SCOPE_TYPES = [
  DataSelfServeScopeType.BOOK,
  DataSelfServeScopeType.SEGMENT,
  DataSelfServeScopeType.INDUSTRY,
];

export const UPLOAD_SCOPE_TYPES = [
  DataSelfServeScopeType.CLIENT_NO,
  DataSelfServeScopeType.LOAN_NO,
  DataSelfServeScopeType.DAO,
];

export class SearchDataSelfServeRequestDto {
  @IsOptional()
  @IsEnum(DataSelfServeRequestGroup)
  requestGroup?: DataSelfServeRequestGroup;

  @IsOptional()
  @IsEnum(DataSelfServeRequestStatus)
  requestStatus?: DataSelfServeRequestStatus;

  @IsOptional()
  @IsEnum(DataSelfServeUploadMethod)
  inputMethod?: DataSelfServeUploadMethod;

  @IsOptional()
  @IsString()
  startCreatedAt?: string;

  @IsOptional()
  @IsString()
  endCreatedAt?: string;

  @IsOptional()
  @IsString()
  sortField?: string = 'createdAt';

  @IsOptional()
  @IsString()
  sortValue?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsString()
  keyword?: string = '';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;
}

export class DataSelfServeRequestGroupQueryDto {
  @IsOptional()
  @IsEnum(DataSelfServeRequestGroup)
  requestGroup?: DataSelfServeRequestGroup;
}

export class CreateDataSelfServeRequestDto {
  @ApiProperty()
  @IsString()
  fromDate: string;

  @ApiProperty()
  @IsString()
  toDate: string;

  @ApiProperty({ enum: DataSelfServeRequestGroup })
  @IsEnum(DataSelfServeRequestGroup)
  requestGroup: DataSelfServeRequestGroup;

  @ApiProperty({ enum: DataSelfServeScopeType })
  @IsEnum(DataSelfServeScopeType)
  scopeType: DataSelfServeScopeType;

  @ApiProperty()
  @IsString()
  scopeValue: string;
}

export class ValidateDataSelfServeFileDto {
  @IsString()
  fileUrl: string;

  @IsEnum(DataSelfServeRequestGroup)
  requestGroup: DataSelfServeRequestGroup;

  @IsEnum(DataSelfServeScopeType)
  scopeType: DataSelfServeScopeType;

  @IsString()
  fileSize: string;

  @IsString()
  fileName: string;
}

export class SubmitDataSelfServeRequestDto {
  @IsString()
  fromDate: string;

  @IsString()
  toDate: string;
}

export class UpdateDataSelfServeRequestDto {
  @IsOptional()
  @IsString()
  destination_path?: string;

  @IsEnum(DataSelfServeStorageType)
  storage_type: DataSelfServeStorageType;

  @IsEnum(DataSelfServeRequestStatus)
  status: DataSelfServeRequestStatus;

  @IsNotEmpty()
  @IsString()
  source: string;
}
