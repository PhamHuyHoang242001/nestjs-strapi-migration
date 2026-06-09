import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsString } from 'class-validator';

export class OwnerAssignmentDto {
  @ApiProperty({ description: 'Resource type: workspace, bicc_department, etc.' })
  @IsNotEmpty()
  @IsString()
  resource_type: string;

  @ApiProperty({ description: 'Array of resource IDs', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  resource_ids: number[];
}
