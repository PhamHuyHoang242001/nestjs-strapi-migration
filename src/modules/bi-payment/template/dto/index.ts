import { PartialType } from '@nestjs/swagger';
import { CreateBiPaymentTemplateDto } from './create-bi-payment-template.dto';

export class UpdateBiPaymentTemplateDto extends PartialType(CreateBiPaymentTemplateDto) {}

export { CreateBiPaymentTemplateDto };
