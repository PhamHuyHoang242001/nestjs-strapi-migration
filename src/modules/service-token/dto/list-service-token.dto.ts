import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Query filters for listing service tokens (pagination/sort handled by decorators). */
export class ListServiceTokenDto {
  @ApiPropertyOptional({ description: 'Search by token name (case-insensitive, partial match)' })
  @IsOptional()
  @IsString()
  name?: string;
}
