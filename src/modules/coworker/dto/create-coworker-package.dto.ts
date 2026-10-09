import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AssetHubTagKind } from '@modules/databases/asset-hub-tag.entity';
import { MAX_RESPONSIBLE_USERS } from '@modules/asset-hub-catalog/asset-hub-item-meta.service';

export class CreateCoworkerPackageDto {
  @ApiProperty({ description: 'User-provided unique live code', maxLength: 100 })
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly code: string;

  @ApiProperty({ description: 'Khối chủ quản — ID from /v1/asset-hub/publishers' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly publisher_id: number;

  @ApiProperty({ description: 'Tác giả — user IDs (full replace)', type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_RESPONSIBLE_USERS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  readonly responsible_user_ids: number[];

  @ApiProperty({ description: 'Supporter user IDs (full replace)', type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RESPONSIBLE_USERS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  readonly supporter_ids?: number[];

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly owning_unit_name?: string;

  @ApiProperty({ enum: AssetHubTagKind })
  @IsEnum(AssetHubTagKind)
  readonly kind: AssetHubTagKind;

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

  @ApiProperty({ type: [Number], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  readonly channel_ids: number[];

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly model_id: number;

  @ApiProperty({ description: 'Teams meeting/channel URL' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  readonly link: string;
}
