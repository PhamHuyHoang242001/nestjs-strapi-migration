import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchUserManagementDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch_code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  role_id?: number;

  /** Filter values: 'active' | 'inactive' | 'orphan' */
  @ApiProperty({ required: false, enum: ['active', 'inactive', 'orphan'] })
  @IsOptional()
  @IsString()
  status?: string;
}
