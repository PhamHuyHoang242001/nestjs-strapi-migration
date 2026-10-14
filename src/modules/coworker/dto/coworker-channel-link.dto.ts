import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Upper bound on channels per version; the channel catalog is tiny, this only caps the payload.
export const MAX_COWORKER_CHANNELS = 20;

// One channel of a coworker version and that channel's link. The link's origin is checked
// against the channel's configured domain(s) in the service, where the channel row is loaded.
export class CoworkerChannelLinkDto {
  @ApiProperty({ description: 'Channel ID from /v1/ai-hub/coworker/channels' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  readonly channel_id: number;

  @ApiProperty({ description: "Link for this channel; origin must match the channel's domain", maxLength: 2000 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  readonly link: string;
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
