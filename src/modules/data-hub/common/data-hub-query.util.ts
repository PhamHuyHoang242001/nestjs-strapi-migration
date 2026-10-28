import { BaseSearchDto } from '@common/dto/common.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// "Live" row predicate for every Data Hub soft-delete table. Written exactly like the WHERE of the partial
// indexes (`deleted_at IS NULL AND is_deleted IS NOT TRUE`) so the planner can use them; for a boolean it is the
// same as COALESCE(is_deleted, false) = false (NULL and false are live, true is deleted).
export const liveSql = (alias: string): string => `${alias}.deleted_at IS NULL AND ${alias}.is_deleted IS NOT TRUE`;

// Live AND active: the rule for any consumer or data service reached through a relation (counts, linked
// lists, filters). Both tables carry `status`; an inactive or soft-deleted row must not show up or be counted.
export const activeSql = (alias: string): string => `${liveSql(alias)} AND ${alias}.status = 'active'`;

// Escape LIKE wildcards so user search text is matched literally (used with ILIKE ... ESCAPE '\').
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// `?ids=1,2` and `?ids=1&ids=2` both become [1, 2]; blanks are dropped.
export const toNumberArray = ({ value }: { value: unknown }): number[] | undefined => {
  const list = toStringList(value);
  return list === undefined ? undefined : list.map((v) => Number(v));
};

// `?codes=A,B` and `?codes=A&codes=B` both become ['A', 'B'].
export const toStringArray = ({ value }: { value: unknown }): string[] | undefined => toStringList(value);

function toStringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

// Shared list query: keyword / page / limit / sort come from BaseSearchDto (repo-wide convention).
// page and limit are redeclared only to add bounds: page < 1 would produce a negative OFFSET, and an
// unbounded limit would let one request pull a whole table.
export class DataHubPageQueryDto extends BaseSearchDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export interface DataHubPageMeta {
  total: number;
  page: number;
  limit: number;
}

export const toPaging = (q: { page?: number; limit?: number }): { page: number; limit: number; offset: number } => {
  const page = q.page ?? 1;
  const limit = q.limit ?? 10;
  return { page, limit, offset: (page - 1) * limit };
};

// Trimmed search text, or undefined when blank.
export const searchTerm = (keyword?: string): string | undefined => {
  const s = keyword?.trim();
  return s ? s : undefined;
};

// TypeORM's postgres driver answers UPDATE ... RETURNING as [rows, affectedCount] but INSERT ... RETURNING as rows.
export function returningRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as T[];
  }
  return result as T[];
}
