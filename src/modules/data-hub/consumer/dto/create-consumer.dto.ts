import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { UpdateConsumerDto } from './update-consumer.dto';

// Code is normalized to upper case before validation so 'crm_app' and 'CRM_APP' are the same consumer.
export class CreateConsumerDto extends UpdateConsumerDto {
  @ApiProperty({ example: 'CRM_APP' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9_]{2,100}$/, { message: 'code must match ^[A-Z0-9_]{2,100}$' })
  readonly code: string;
}
