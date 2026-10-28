import { BadRequestException } from '@nestjs/common';
import { DataServiceSourceTableInputDto } from './dto';

export const lower = (value: string): string => value.trim().toLowerCase();

// Checks that need no database: a table appears once (by id and by name), a term id appears once, and codes
// do not repeat inside one table (case-insensitive).
export function assertSourceTablePayload(groups: DataServiceSourceTableInputDto[]): void {
  const ids = groups.filter((g) => g.id !== undefined).map((g) => Number(g.id));
  const names = groups.map((g) => lower(g.name));
  if (new Set(ids).size !== ids.length || new Set(names).size !== names.length) {
    throw new BadRequestException('DUPLICATE_SOURCE_TABLES: a source table is listed more than once');
  }

  const termIds = groups.flatMap((g) => g.terms.filter((t) => t.id !== undefined).map((t) => Number(t.id)));
  if (new Set(termIds).size !== termIds.length) {
    throw new BadRequestException('DUPLICATE_PHYSICAL_TERMS: a term is listed more than once');
  }

  const clashes: string[] = [];
  for (const g of groups) {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const t of g.terms) {
      const key = lower(t.code);
      if (seen.has(key)) dupes.add(t.code);
      seen.add(key);
    }
    if (dupes.size > 0) clashes.push(`${g.name}: ${[...dupes].join(', ')}`);
  }
  if (clashes.length > 0) throw new BadRequestException(`DUPLICATE_TERM_CODES: ${clashes.join('; ')}`);
}
