import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @ApiPropertyOptional({ description: 'Permission IDs to replace all current permissions', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  permission_ids?: number[];

  @ApiPropertyOptional({ description: 'User IDs to replace all current user assignments for this role', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  user_ids?: number[];
}
