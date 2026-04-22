import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePermissionMatrixDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1, { message: 'permission_ids must contain at least 1 element' })
  @IsInt({ each: true })
  @Type(() => Number)
  permission_ids: number[];
}
