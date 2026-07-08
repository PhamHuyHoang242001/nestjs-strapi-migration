import { PartialType } from '@nestjs/swagger';
import { CreateBiPaymentProjectDto } from './create-bi-payment-project.dto';

// Update = partial of Create. All fields optional.
export class UpdateBiPaymentProjectDto extends PartialType(CreateBiPaymentProjectDto) {}
