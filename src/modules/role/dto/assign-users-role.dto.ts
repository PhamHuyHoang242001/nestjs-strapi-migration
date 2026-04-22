import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignUsersRoleDto {
  @ApiProperty({ type: [Number] })
  @IsNotEmpty()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  user_ids: number[];
}
