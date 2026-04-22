import { IsNotEmpty, IsString } from 'class-validator';
import { EmailDto } from './username.dto';
import { ApiProperty } from '@nestjs/swagger';

export class VefifyEmailDto extends EmailDto {
  @ApiProperty({ description: 'verify code' })
  @IsNotEmpty()
  @IsString()
  code: string;
}
