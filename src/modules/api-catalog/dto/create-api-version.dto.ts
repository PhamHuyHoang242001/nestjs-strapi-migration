import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { AssetHubItemMetaFieldsDto } from '@modules/asset-hub-catalog/dto';
import { ApiSpecFieldsDto } from './api-spec-fields.dto';

class CreateApiVersionBaseDto extends AssetHubItemMetaFieldsDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly category_id: number;

  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly avatar_url?: string;

  @ApiProperty({ maxLength: 200 })
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  readonly name: string;

  @ApiProperty({ maxLength: 1000 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  readonly short_description: string;

  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly changelog_note?: string;
}

export class CreateApiVersionDto extends IntersectionType(CreateApiVersionBaseDto, ApiSpecFieldsDto) {}
