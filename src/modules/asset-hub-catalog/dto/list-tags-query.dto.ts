import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AssetHubTagArtifactType, AssetHubTagKind } from '@modules/databases/asset-hub-tag.entity';

// Query DTO for GET /v1/asset-hub/tags. Both filters are optional; an unknown value fails
// validation (400) rather than silently returning the unfiltered catalog.
export class ListTagsQueryDto {
  @ApiProperty({ required: false, enum: AssetHubTagArtifactType, description: 'Restrict to one workspace' })
  @IsOptional()
  @IsEnum(AssetHubTagArtifactType)
  readonly artifact_type?: AssetHubTagArtifactType;

  @ApiProperty({ required: false, enum: AssetHubTagKind, description: 'Restrict to one ownership kind' })
  @IsOptional()
  @IsEnum(AssetHubTagKind)
  readonly kind?: AssetHubTagKind;
}
