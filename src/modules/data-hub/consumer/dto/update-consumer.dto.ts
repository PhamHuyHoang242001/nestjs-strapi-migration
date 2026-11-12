import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DataHubConsumerCategory } from '@modules/databases/data-hub-enums';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

// Code is normalized to upper case before validation so 'crm_app' and 'CRM_APP' are the same consumer.
export const toConsumerCode = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
export const CONSUMER_CODE_PATTERN = /^[A-Z0-9_]{2,100}$/;
export const CONSUMER_CODE_MESSAGE = 'code must match ^[A-Z0-9_]{2,100}$';

// Consumer fields shared by create and edit.
export class ConsumerFieldsDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly name: string;

  @ApiProperty({ enum: DataHubConsumerCategory })
  @IsEnum(DataHubConsumerCategory)
  readonly category: DataHubConsumerCategory;

  // Đơn vị chủ quản (required).
  @ApiProperty()
  @IsInt()
  @Min(1)
  readonly owner_unit_id: number;

  // Hệ thống (required).
  @ApiProperty()
  @IsInt()
  @Min(1)
  readonly system_id: number;

  // Dịch vụ hệ thống, free text (optional); null / '' / left out = none.
  @ApiProperty({ required: false, nullable: true, maxLength: 255 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly system_service?: string | null;

  @ApiProperty({ maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  readonly short_description: string;

  // URL returned by the upload API; null or '' clears the avatar.
  @ApiProperty({ required: false, nullable: true, maxLength: 2000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly avatar_url?: string | null;

  @ApiProperty({ type: [Number], description: 'SO APP: 1-20 distinct user ids' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  readonly so_app_user_ids: number[];
}

// Edit body: code may be changed (left out = keep the stored one); a code taken by another live app is 409.
export class UpdateConsumerDto extends ConsumerFieldsDto {
  @ApiProperty({ required: false, example: 'CRM_APP' })
  @Transform(toConsumerCode)
  @IsOptional()
  @IsString()
  @Matches(CONSUMER_CODE_PATTERN, { message: CONSUMER_CODE_MESSAGE })
  readonly code?: string;
}
