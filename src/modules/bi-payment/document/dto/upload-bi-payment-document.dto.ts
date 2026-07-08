import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Strapi parity (ICreateDocument): camelCase. workStep = EworkstepType (prepare/recon_data/...).
export class OtherFileItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty({ required: true, description: 'Uploaded file path/url' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ required: false, description: 'File extension/type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fileSize?: string;
}

export class UploadBiPaymentDocumentDto {
  @ApiProperty({ required: true })
  @IsInt()
  templateId: number;

  @ApiProperty({ required: true })
  @IsInt()
  projectId: number;

  @ApiProperty({ required: true })
  @IsInt()
  programId: number;

  @ApiProperty({ required: true, description: 'EworkstepType: prepare/recon_data/recon_feedback/ex_prepare' })
  @IsString()
  workStep: string;

  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: true, description: 'S3 file url' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  checklistId?: number;

  @ApiProperty({ required: false, description: 'Document status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  s3DestinationPath?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fileSize?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fileNameOriginal?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  backDateMode?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  backDateType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  backDateFileId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  backDateTime?: string;

  @ApiProperty({ required: true, type: [OtherFileItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OtherFileItemDto)
  files: OtherFileItemDto[];

  @ApiProperty({ required: false, description: 'Processor mode' })
  @IsOptional()
  @IsString()
  processorMode?: string;
}
