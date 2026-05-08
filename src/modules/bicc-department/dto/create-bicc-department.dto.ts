import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBiccDepartmentDto {
  @ApiProperty({ required: true, description: 'Department name' })
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false, description: 'Department code (alphanumeric)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code: string;
}
