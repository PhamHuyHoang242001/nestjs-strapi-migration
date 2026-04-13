import { Trim } from '@common/decorators/transforms.decorator';
import { MAX_STR_LENGTH, MAX_TEXT_LENGTH, MIN_STR_LENGTH } from '@constant/index';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly screen_id: number;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Trim()
  @MinLength(MIN_STR_LENGTH)
  @MaxLength(MAX_STR_LENGTH)
  name: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Trim()
  @MinLength(MIN_STR_LENGTH)
  @MaxLength(MAX_STR_LENGTH)
  code: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Trim()
  @MinLength(MIN_STR_LENGTH)
  @MaxLength(MAX_STR_LENGTH)
  method: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  @Trim()
  @MinLength(MIN_STR_LENGTH)
  @MaxLength(MAX_STR_LENGTH)
  action: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(MIN_STR_LENGTH)
  @MaxLength(MAX_TEXT_LENGTH)
  description: string;
}
