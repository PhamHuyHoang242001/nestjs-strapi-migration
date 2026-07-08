import { ApiProperty } from '@nestjs/swagger';
import { BiPaymentChecklistStatus, BiPaymentChecklistType } from '@common/enums/bi-payment.enums';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Strapi parity (ICreateChecklist): name, type, programId.
export class CreateBiPaymentChecklistDto {
  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: true, enum: BiPaymentChecklistType })
  @IsEnum(BiPaymentChecklistType)
  type: BiPaymentChecklistType;

  @ApiProperty({ required: true })
  @IsInt()
  programId: number;

  @ApiProperty({ required: false, enum: BiPaymentChecklistStatus })
  @IsOptional()
  @IsEnum(BiPaymentChecklistStatus)
  checklistStatus?: BiPaymentChecklistStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  version?: number;
}
