import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

// Public shape of every user reference in Data Hub responses: id + email only.
export interface DataHubUserRef {
  id: number;
  email: string | null;
}

const uniqueIds = (ids: Array<number | null | undefined>): number[] =>
  Array.from(new Set(ids.filter((x): x is number => typeof x === 'number' && Number.isInteger(x))));

@Injectable()
export class DataHubUserRefService {
  constructor(private readonly dataSource: DataSource) {}

  // One batched lookup per request; only id + email leave the users table.
  async resolve(
    ids: Array<number | null | undefined>,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<number, DataHubUserRef>> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) return new Map();
    const rows: Array<{ id: number; email: string | null }> = await manager.query(
      'SELECT id, email FROM users WHERE id = ANY($1)',
      [unique],
    );
    return new Map(rows.map((r) => [Number(r.id), { id: Number(r.id), email: r.email ?? null }]));
  }

  // A deleted/unknown user still shows its id so history stays readable.
  toRef(map: Map<number, DataHubUserRef>, id: number | null | undefined): DataHubUserRef | null {
    if (id === null || id === undefined) return null;
    return map.get(Number(id)) ?? { id: Number(id), email: null };
  }

  toRefs(map: Map<number, DataHubUserRef>, ids: number[]): DataHubUserRef[] {
    return ids.map((id) => map.get(Number(id)) ?? { id: Number(id), email: null });
  }

  // Every id must be a live user. One generic error so the API is not a user-existence oracle.
  async assertUsers(manager: EntityManager, ids: Array<number | null | undefined>): Promise<void> {
    const unique = uniqueIds(ids);
    if (unique.length === 0) return;
    const rows: Array<{ id: number }> = await manager.query(
      `SELECT id FROM users
       WHERE id = ANY($1) AND deleted_at IS NULL AND COALESCE(is_deleted, false) = false`,
      [unique],
    );
    if (rows.length !== unique.length) {
      throw new BadRequestException('INVALID_USERS: one or more users do not exist');
    }
  }
}
