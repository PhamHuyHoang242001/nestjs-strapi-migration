import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkUserActionDto {
  @ApiProperty({ type: [Number] })
  @IsNotEmpty()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  user_ids: number[];
}

export class BulkAssignRoleDto extends BulkUserActionDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsInt()
  @Type(() => Number)
  role_id: number;
}
