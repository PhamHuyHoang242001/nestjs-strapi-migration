import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsPositive } from 'class-validator';

/**
 * Hand a report's edit (RUD) grant from one user to another.
 * Removing A's edit + granting B transfers the derived grant-authority in one atomic op.
 * Third-party rules on the same records are untouched.
 */
export class HandoverDataAccessDto {
  @ApiProperty({ description: 'Module id whose table the records belong to', example: 8 })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  module_id: number;

  @ApiProperty({ description: 'Record ids to hand over (all-or-nothing)', type: [Number], example: [12, 15] })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  data_ids: number[];

  @ApiProperty({ description: 'User currently holding the edit grant (A)', example: 5 })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  from_user_id: number;

  @ApiProperty({ description: 'User receiving the edit grant (B)', example: 9 })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  to_user_id: number;
}
