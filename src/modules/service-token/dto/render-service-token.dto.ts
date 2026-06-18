import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RenderServiceTokenDto {
  @ApiProperty({ description: 'Service type identifier embedded in the token' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ description: 'Service id; also stored as the token name' })
  @IsString()
  @IsNotEmpty()
  id: string;
}
