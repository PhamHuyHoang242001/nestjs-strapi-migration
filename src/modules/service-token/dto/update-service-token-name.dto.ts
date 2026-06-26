import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Update payload for a service token — only `name` is editable. */
export class UpdateServiceTokenNameDto {
  @ApiProperty({ description: 'New display name for the service token' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
