import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty } from 'class-validator';

export class RemoveLinkDataAccessDto {
  @ApiProperty({ description: 'Subject type: role or user', example: 'role' })
  @IsNotEmpty()
  @IsIn(['role', 'user'])
  subject_type: 'role' | 'user';

  @ApiProperty({ description: 'Subject ID (role_id or user_id)', example: 1 })
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  subject_id: number;
}
