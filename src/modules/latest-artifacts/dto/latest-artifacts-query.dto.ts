import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Query DTO for GET /v1/asset-hub/latest.
// `limit` is an OPTIONAL per-request override of the configured LATEST_ARTIFACTS_LIMIT default
// (the "2 newest" count). Omitted → the service falls back to the env-driven config value.
// Capped at 50 so a caller cannot turn the feed into a full-table scan.
export class LatestArtifactsQueryDto {
  @ApiProperty({
    required: false,
    description:
      'How many latest items to return PER type (skills and prompts each). Defaults to LATEST_ARTIFACTS_LIMIT.',
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  readonly limit?: number;
}
