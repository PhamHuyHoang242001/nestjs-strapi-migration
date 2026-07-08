import { ApiProperty } from '@nestjs/swagger';
import { BiPaymentWorkstepCurrent } from '@common/enums/bi-payment.enums';
import { IsEnum } from 'class-validator';

// Strapi parity: PATCH /program/next-step nhận target step (camelCase).
export class NextStepDto {
  @ApiProperty({ required: true, enum: BiPaymentWorkstepCurrent, description: 'Bước đích' })
  @IsEnum(BiPaymentWorkstepCurrent)
  targetStep: BiPaymentWorkstepCurrent;
}
