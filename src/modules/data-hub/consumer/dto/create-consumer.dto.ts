import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { CONSUMER_CODE_MESSAGE, CONSUMER_CODE_PATTERN, ConsumerFieldsDto, toConsumerCode } from './update-consumer.dto';

export class CreateConsumerDto extends ConsumerFieldsDto {
  @ApiProperty({ example: 'CRM_APP' })
  @Transform(toConsumerCode)
  @IsString()
  @Matches(CONSUMER_CODE_PATTERN, { message: CONSUMER_CODE_MESSAGE })
  readonly code: string;
}
