import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

// Create category payload — name duy nhất (service check trùng).
export class CreateBiPaymentCategoryDto {
  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(255)
  name: string;
}
