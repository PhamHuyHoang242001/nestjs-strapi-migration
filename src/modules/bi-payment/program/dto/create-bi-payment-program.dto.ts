import { ApiProperty } from '@nestjs/swagger';
import {
  BiPaymentProgramFrequency,
  BiPaymentProgramStatus,
  BiPaymentProgramType,
  BiPaymentProgressStatus,
  BiPaymentWorkstepCurrent,
} from '@common/enums/bi-payment.enums';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Strapi parity (createProgramSchema yup): camelCase field. Required: code/name/biccDepartmentId/
// programStatus/programType/expectedStartingDate/expectedEndingDate/requester/biccUserIds/
// picConfirmationIds/buUserIds/saleGroupIds/workSteps/categoryIds/requesterUnit/projectId.
// Frequency 'semi_annual' (Strapi underscore) → 'semi-annual' (NestJS enum) qua @Transform.
export class CreateBiPaymentProgramDto {
  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(256)
  code: string;

  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(256)
  name: string;

  @ApiProperty({ required: true, description: 'BICC department FK' })
  @IsInt()
  biccDepartmentId: number;

  @ApiProperty({ required: true, enum: BiPaymentProgramStatus })
  @IsEnum(BiPaymentProgramStatus)
  programStatus: BiPaymentProgramStatus;

  @ApiProperty({ required: true, enum: BiPaymentProgramType })
  @IsEnum(BiPaymentProgramType)
  programType: BiPaymentProgramType;

  @ApiProperty({ required: false, enum: BiPaymentProgramFrequency, description: 'Strapi: semi_annual' })
  @IsOptional()
  @IsEnum(BiPaymentProgramFrequency, { each: true })
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => String)
  @Transform(({ value }) => mapFrequencyArray(value), { toClassOnly: true })
  frequencies?: BiPaymentProgramFrequency[];

  @ApiProperty({ required: true, description: 'Project FK' })
  @IsInt()
  projectId: number;

  @ApiProperty({ required: true })
  @IsDateString()
  expectedStartingDate: string;

  @ApiProperty({ required: true })
  @IsDateString()
  expectedEndingDate: string;

  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(5000)
  requester: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  requesterUnit?: string;

  @ApiProperty({ required: true, type: [Number], description: 'BICC user ids' })
  @IsArray()
  @IsInt({ each: true })
  biccUserIds: number[];

  @ApiProperty({ required: true, type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  picConfirmationIds: number[];

  @ApiProperty({ required: true, type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  buUserIds: number[];

  @ApiProperty({ required: true, type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  saleGroupIds: number[];

  @ApiProperty({ required: true, type: [Number], description: 'Category ids' })
  @IsArray()
  @IsInt({ each: true })
  categoryIds: number[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  requestReason?: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  biccSupporter?: string;

  @ApiProperty({ required: false, enum: BiPaymentProgressStatus })
  @IsOptional()
  @IsEnum(BiPaymentProgressStatus)
  progressStatus?: BiPaymentProgressStatus;

  @ApiProperty({ required: false, enum: BiPaymentWorkstepCurrent })
  @IsOptional()
  @IsEnum(BiPaymentWorkstepCurrent)
  workstepCurrent?: BiPaymentWorkstepCurrent;
}

// Map Strapi frequency 'semi_annual' (underscore) → 'semi-annual' (NestJS enum).
// Các giá trị khác (weekly/monthly/quarterly) khớp 1:1, giữ nguyên.
function mapFrequencyValue(v: unknown): unknown {
  if (typeof v === 'string' && v === 'semi_annual') return 'semi-annual';
  return v;
}

function mapFrequencyArray(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mapFrequencyValue);
  return mapFrequencyValue(value);
}
