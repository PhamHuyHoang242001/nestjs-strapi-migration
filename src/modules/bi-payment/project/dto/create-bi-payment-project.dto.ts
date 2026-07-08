import { ApiProperty } from '@nestjs/swagger';
import { BiPaymentProgramFrequency, BiPaymentProgramType, BiPaymentProjectStatus } from '@common/enums/bi-payment.enums';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Strapi parity (createProjectSchema yup): camelCase field names. Required: projectCode/projectName/
// s3Id/biccDepartmentId/projectStatus/projectType/categoryIds/expectedStartingDate (+ workSteps,
// frequencies conditional). Frequency semi_annual → semi-annual via @Transform.
export class WorkStepItemDto {
  @ApiProperty({ required: true, description: 'WorkStepBI value' })
  @IsString()
  workStep: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sla?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  buRequestReason?: string;
}

export class CreateBiPaymentProjectDto {
  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(32)
  projectCode: string;

  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(255)
  projectName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ required: true, enum: BiPaymentProgramType })
  @IsEnum(BiPaymentProgramType)
  projectType: BiPaymentProgramType;

  @ApiProperty({ required: false, enum: BiPaymentProgramFrequency, description: 'Strapi: semi_annual' })
  @IsOptional()
  @IsEnum(BiPaymentProgramFrequency, { each: true })
  @IsArray()
  @Type(() => String)
  @Transform(({ value }) => mapFrequencyArray(value), { toClassOnly: true })
  frequencies?: BiPaymentProgramFrequency[];

  @ApiProperty({ required: true })
  @IsDateString()
  expectedStartingDate: string;

  @ApiProperty({ required: true })
  @IsDateString()
  expectedEndingDate: string;

  @ApiProperty({ required: true, enum: BiPaymentProjectStatus })
  @IsEnum(BiPaymentProjectStatus)
  projectStatus: BiPaymentProjectStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  biccPic?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  buPic?: string;

  @ApiProperty({ required: true, description: 'S3 config id' })
  @IsInt()
  s3Id: number;

  @ApiProperty({ required: true, description: 'BICC department FK (parent)' })
  @IsInt()
  biccDepartmentId: number;

  @ApiProperty({ required: true, type: [Number], description: 'Category ids' })
  @IsArray()
  @IsInt({ each: true })
  categoryIds: number[];

  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(5000)
  requester: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  requesterUnit?: string;

  @ApiProperty({ required: true, type: [WorkStepItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkStepItemDto)
  workSteps: WorkStepItemDto[];

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}

// Map Strapi frequency 'semi_annual' → 'semi-annual' (NestJS enum).
function mapFrequencyValue(v: unknown): unknown {
  if (typeof v === 'string' && v === 'semi_annual') return 'semi-annual';
  return v;
}

function mapFrequencyArray(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mapFrequencyValue);
  return mapFrequencyValue(value);
}
