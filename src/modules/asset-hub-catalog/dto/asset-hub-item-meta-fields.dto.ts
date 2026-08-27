import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { USAGE_GUIDE_MAX_LENGTH } from '@common/utils/usage-guide-html.util';
import { AssetHubTagKind } from '@modules/databases/asset-hub-tag.entity';
import { MAX_RESPONSIBLE_USERS, MAX_VERSION_TAGS } from '../asset-hub-item-meta.service';

// Metadata every asset-hub write carries, shared by the skill and prompt create/bump DTOs.
// There is no separate metadata endpoint: a create or a version bump is the only way to set these,
// so both request bodies carry the full set and the service persists them in one transaction.
export abstract class AssetHubItemMetaFieldsDto {
  @ApiProperty({ description: 'Publishing unit ID from /v1/asset-hub/publishers' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly publisher_id: number;

  @ApiProperty({
    description: 'User IDs of the people in charge (full replace)',
    type: [Number],
    minItems: 1,
    maxItems: MAX_RESPONSIBLE_USERS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_RESPONSIBLE_USERS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  readonly responsible_user_ids: number[];

  // Sanitized server-side before storage; the cap here bounds the raw payload, and sanitizing can
  // only shrink it. Emptiness is judged after sanitizing (markup with no text or image counts as
  // empty), so that rule lives in the service rather than in a validator.
  @ApiProperty({ description: 'Usage guide HTML from the editor', maxLength: USAGE_GUIDE_MAX_LENGTH })
  @IsString()
  @MaxLength(USAGE_GUIDE_MAX_LENGTH)
  readonly usage_guide_html: string;

  @ApiProperty({ enum: AssetHubTagKind, description: 'personal or enterprise (stored on the version row)' })
  @IsEnum(AssetHubTagKind)
  readonly kind: AssetHubTagKind;

  @ApiProperty({
    description: 'Catalog tag IDs from /v1/asset-hub/tags (must match this workspace). Optional.',
    type: [Number],
    required: false,
    maxItems: MAX_VERSION_TAGS,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_VERSION_TAGS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  readonly tag_ids?: number[];
}
