import { PartialType } from '@nestjs/swagger';
import { CreateBiPaymentChecklistDto } from './create-bi-payment-checklist.dto';

export class UpdateBiPaymentChecklistDto extends PartialType(CreateBiPaymentChecklistDto) {}

export { CreateBiPaymentChecklistDto };
