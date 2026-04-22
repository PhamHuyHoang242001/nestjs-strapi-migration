import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DeleteMyAccountDto {
  @ApiProperty()
  @IsString()
  public reason: string;
}
