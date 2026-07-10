import { PartialType } from '@nestjs/swagger';
import { CreateBiPaymentTemplateDto } from './create-bi-payment-template.dto';
import { SearchBiPaymentTemplateDto } from './search-bi-payment-template.dto';
import { DuplicateManyTemplateDto } from './duplicate-many-template.dto';

export class UpdateBiPaymentTemplateDto extends PartialType(CreateBiPaymentTemplateDto) {}

export { CreateBiPaymentTemplateDto, SearchBiPaymentTemplateDto, DuplicateManyTemplateDto };
