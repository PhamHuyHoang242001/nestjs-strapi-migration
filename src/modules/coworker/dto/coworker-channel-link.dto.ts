import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Upper bound on channels per version; the channel catalog is tiny, this only caps the payload.
export const MAX_COWORKER_CHANNELS = 20;

// One channel of a coworker version and that channel's optional link. When present, the link's
// origin is checked against the channel's configured domain(s) in the service, where the channel
// row is loaded; null / empty / whitespace-only means "no link" and is stored as NULL.
export class CoworkerChannelLinkDto {
  @ApiProperty({ description: 'Channel ID from /v1/ai-hub/coworker/channels' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly channel_id: number;

  @ApiProperty({
    description: "Optional link for this channel; when set, origin must match the channel's domain",
    maxLength: 2000,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly link?: string | null;
}

// Shared `channels` field for the create and bump bodies: at least one, each channel at most once.
export function CoworkerChannelsField(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ type: [CoworkerChannelLinkDto], minItems: 1, maxItems: MAX_COWORKER_CHANNELS }),
    IsArray(),
    ArrayMinSize(1),
    ArrayMaxSize(MAX_COWORKER_CHANNELS),
    ArrayUnique((c: CoworkerChannelLinkDto) => c?.channel_id, { message: 'channels must not repeat a channel_id' }),
    ValidateNested({ each: true }),
    Type(() => CoworkerChannelLinkDto),
  );
}
