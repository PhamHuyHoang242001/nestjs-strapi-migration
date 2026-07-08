import { PartialType } from '@nestjs/swagger';
import { CreateBiPaymentProgramDto } from './create-bi-payment-program.dto';

export class UpdateBiPaymentProgramDto extends PartialType(CreateBiPaymentProgramDto) {}
