import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListRoleDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  readonly search?: string;
}
