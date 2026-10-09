import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectCoworkerVersionDto {
  @ApiProperty({ maxLength: 2000 })
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @IsString()
  @MaxLength(2000)
  readonly reason: string;
}
