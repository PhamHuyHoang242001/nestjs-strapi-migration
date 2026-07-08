import { ApiProperty } from '@nestjs/swagger';
import {
  MaToolTemplateStatus,
  MaToolTemplateType,
  MaToolUploadMethod,
  MaToolWorkstepType,
} from '@common/enums/ma-tool.enums';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
