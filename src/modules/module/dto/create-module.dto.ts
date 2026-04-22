import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsInt, IsBoolean, MaxLength } from 'class-validator';
import { Trim } from '@common/decorators/transforms.decorator';
import { Type } from 'class-transformer';

export class CreateModuleDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Trim()
  @MaxLength(255)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  path: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  table_name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  parent_id: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  is_active: boolean;
}
