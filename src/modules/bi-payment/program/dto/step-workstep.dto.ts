import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { BiPaymentCalculatingStatus, BiPaymentWorkstepCurrent } from '@common/enums/bi-payment.enums';

// Strapi parity (IUpdatePreparingWorkstepProgram): camelCase field names.
// Entity cols snake_case, service map camelCase→snake_case (Phase 5).
export class UpdatePreparingWorkstepDto {
  @ApiProperty({ required: false, enum: BiPaymentWorkstepCurrent })
  @IsOptional()
  @IsEnum(BiPaymentWorkstepCurrent)
  workstepCurrent?: BiPaymentWorkstepCurrent;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  preparingUpFileStartingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  preparingUpFileEndingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  issueFileStartingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  issueFileEndingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isApplyUploadFile?: boolean;
}

// Strapi parity (IUpdateCalculatingWorkstepProgram).
export class UpdateCalculatingWorkstepDto {
  @ApiProperty({ required: false, enum: BiPaymentWorkstepCurrent })
  @IsOptional()
  @IsEnum(BiPaymentWorkstepCurrent)
  workstepCurrent?: BiPaymentWorkstepCurrent;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reportLink?: string;

  @ApiProperty({ required: false, enum: BiPaymentCalculatingStatus })
  @IsOptional()
  @IsEnum(BiPaymentCalculatingStatus)
  calculatingStatus?: BiPaymentCalculatingStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  calculatingStartingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  calculatingEndingDate?: string;
}

// Strapi parity (IUpdateReconcilationWorkstepProgram).
export class UpdateReconciliationWorkstepDto {
  @ApiProperty({ required: false, enum: BiPaymentWorkstepCurrent })
  @IsOptional()
  @IsEnum(BiPaymentWorkstepCurrent)
  workstepCurrent?: BiPaymentWorkstepCurrent;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  issueFileStartingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  issueFileEndingDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  feedbackLink?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  sendNoti?: boolean;
}

// Strapi parity (IUpdateWaitingForApprovalWorkstepProgram).
export class UpdateWaitingForApprovalWorkstepDto {
  @ApiProperty({ required: false, enum: BiPaymentWorkstepCurrent })
  @IsOptional()
  @IsEnum(BiPaymentWorkstepCurrent)
  workstepCurrent?: BiPaymentWorkstepCurrent;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  linkReportFinal?: string;
}

// Strapi parity (IPICConfirmationFinalLinkReport).
export class PicConfirmFinalLinkDto {
  @ApiProperty({ required: true })
  @IsInt()
  programId: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  linkReportFinal?: string;

  @ApiProperty({ required: true })
  @IsBoolean()
  isApproval: boolean;
}
