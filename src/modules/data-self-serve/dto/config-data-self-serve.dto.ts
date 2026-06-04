import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SearchConfigDataSelfServeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  keyword?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;
}

export class CreateConfigDataSelfServeDto {
  @ApiProperty({ required: true, description: 'Unique config key' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  key: string;

  @ApiProperty({ required: true, description: 'Config value as JSON object' })
  @IsNotEmpty()
  @IsObject()
  value: Record<string, unknown>;
}

export class UpdateConfigDataSelfServeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  key?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  value?: Record<string, unknown>;
}
