import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, Min } from 'class-validator';
import { AI_HUB_ARTIFACT_TYPES, type AiHubArtifactType } from '../ai-hub-package-access.helper';
import { MAX_SUPPORTERS } from '../asset-hub-item-meta.service';

// Route param for the workspace-scoped supporter endpoints.
export class AiHubWorkspaceParamDto {
  @ApiProperty({ enum: AI_HUB_ARTIFACT_TYPES })
  @IsIn(AI_HUB_ARTIFACT_TYPES)
  readonly type: AiHubArtifactType;
}

// Route params for PUT /v1/asset-hub/:type/items/:id/supporters.
export class AiHubPackageParamDto extends AiHubWorkspaceParamDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly id: number;
}

// Full replace: the list sent becomes the package's whole supporter set; [] clears it.
export class ReplaceSupportersDto {
  @ApiProperty({
    description: 'Supporter user IDs (full replace; [] clears). Each must be an upload-eligible user.',
    type: [Number],
    maxItems: MAX_SUPPORTERS,
  })
  @IsArray()
  @ArrayMaxSize(MAX_SUPPORTERS)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  readonly supporter_ids: number[];
}
