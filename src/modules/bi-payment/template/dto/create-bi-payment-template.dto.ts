import { ApiProperty } from '@nestjs/swagger';
import {
  MaToolTemplateStatus,
  MaToolTemplateType,
  MaToolUploadMethod,
  MaToolWorkstepType,
} from '@common/enums/ma-tool.enums';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Strapi parity (ICreateTemplate): camelCase field names.
export class CreateBiPaymentTemplateDto {
  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, enum: MaToolUploadMethod })
  @IsOptional()
  @IsEnum(MaToolUploadMethod)
  uploadMethod?: MaToolUploadMethod;

  @ApiProperty({ required: true })
  @IsInt()
  projectId: number;

  @ApiProperty({ required: true })
  @IsInt()
  programId: number;

  @ApiProperty({ required: true, enum: MaToolWorkstepType, description: 'prepare/recon_data/recon_feedback/ex_prepare' })
  @IsEnum(MaToolWorkstepType)
  workstepType: MaToolWorkstepType;

  @ApiProperty({ required: false, enum: MaToolTemplateType })
  @IsOptional()
  @IsEnum(MaToolTemplateType)
  templateType?: MaToolTemplateType;

  @ApiProperty({ required: false, enum: MaToolTemplateStatus })
  @IsOptional()
  @IsEnum(MaToolTemplateStatus)
  status?: MaToolTemplateStatus;

  @ApiProperty({ required: false, description: 'Duplicate từ template khác (gộp vào create)' })
  @IsOptional()
  @IsInt()
  fromTemplateId?: number;

  // Strapi parity (ICreateTemplate.sheets): sheet/column cascade. NestJS has no
  // sheet_template entity → sheets accepted but ignored. TODO: port
  // saveManySheetTemplate/Column/ValidationRule when sheet entities exist.
  @ApiProperty({ required: false, type: 'array' })
  @IsOptional()
  @IsArray()
  sheets?: any[];
}
