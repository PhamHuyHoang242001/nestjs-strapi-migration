import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

// State filter for the version-management list. 'all' (default) returns every state.
export const VERSION_STATE_FILTERS = ['pending', 'approved', 'rejected', 'all'] as const;
export type VersionStateFilter = (typeof VERSION_STATE_FILTERS)[number];

// Query DTO for GET /v1/api-catalog/versions — the flat 1-row-per-version management list.
// Visibility is derived server-side from the caller's permission set (NOT from any field here):
// api_catalog_package_id is ONLY a display filter, never an authorization input.
export class ListVersionsDto {
  // Filter to specific API packages. Sent as a comma-separated id list (e.g. "1,2,3"); the service
  // filters on p.id. A single value or a repeated/bracket-array form is also tolerated. Invalid or
  // non-positive tokens fail validation so malformed filters cannot silently become an unfiltered query.
  @ApiProperty({ required: false, description: 'Filter to these API package ids, comma-separated (e.g. "1,2,3")', type: String })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const arr = Array.isArray(value) ? value : String(value).split(',');
    return arr.map((c: string | number) => Number(String(c).trim()));
  })
  readonly api_catalog_package_id?: number[];

  @ApiProperty({ required: false, enum: VERSION_STATE_FILTERS, default: 'all' })
  @IsOptional()
  @IsIn(VERSION_STATE_FILTERS as unknown as string[])
  readonly state?: VersionStateFilter = 'all';

  @ApiProperty({ required: false, description: 'Page number', default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  readonly page?: number = 1;

  @ApiProperty({ required: false, description: 'Items per page (max 100)', default: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  readonly pageSize?: number = 20;

  @ApiProperty({ required: false, enum: ['newest', 'oldest'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  readonly sort?: 'newest' | 'oldest' = 'newest';

  // codesOnly=true short-circuits to the distinct (package_id, code, package_name) list for the filter
  // multi-select — SAME visibility predicate, so filter options can never drift from the rows.
  @ApiProperty({ required: false, description: 'Return only distinct packages (id/code/name) for the filter select' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  readonly codesOnly?: boolean = false;
}
