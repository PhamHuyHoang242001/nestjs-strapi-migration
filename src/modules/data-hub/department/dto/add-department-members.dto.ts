import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class AddDepartmentMembersDto {
  @ApiProperty({ type: [Number], description: '1-100 distinct user ids holding a data-service right' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly user_ids: number[];
}

export class RemoveDepartmentMembersDto {
  @ApiProperty({ type: [Number], description: '1-100 distinct user ids to remove from the department' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly user_ids: number[];
}
