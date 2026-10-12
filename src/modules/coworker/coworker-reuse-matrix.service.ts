import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoworkerPackage } from '@modules/databases/coworker-package.entity';
import { AssetHubItemMetaReadService } from '@modules/asset-hub-catalog/asset-hub-item-meta-read.service';
import { ListReuseMatrixQueryDto } from './dto/list-reuse-matrix-query.dto';

const live = (alias: string) =>
  `${alias}.deleted_at IS NULL AND COALESCE(${alias}.is_deleted, false) = false`;

export interface ReuseMatrixColumn {
  id: number;
  code: string;
  name: string;
}

export interface ReuseMatrixRow {
  id: number;
  name: string;
  publisher: { id: number; name: string | null };
  cells: boolean[];
}

@Injectable()
export class CoworkerReuseMatrixService {
  constructor(
    @InjectRepository(CoworkerPackage)
    private readonly coworkerRepo: Repository<CoworkerPackage>,
    private readonly metaRead: AssetHubItemMetaReadService,
  ) {}

  async getMatrix(query: ListReuseMatrixQueryDto): Promise<{
    columns: ReuseMatrixColumn[];
    rows: ReuseMatrixRow[];
    meta: { total: number; page: number; limit: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const manager = this.coworkerRepo.manager;

    const [columns, countRows] = await Promise.all([
      manager.query(
        `SELECT cp.id, cp.code, COALESCE(cv.name, cp.code) AS name
         FROM coworker_packages cp
         INNER JOIN coworker_versions cv
           ON cv.id = cp.active_version_id
          AND cv.deleted_at IS NULL AND COALESCE(cv.is_deleted, false) = false
         WHERE ${live('cp')}
           AND cp.status = 'active'
           AND cp.active_version_id IS NOT NULL
         ORDER BY cp.code, cp.id`,
      ) as Promise<Array<{ id: number; code: string; name: string }>>,
      manager.query(
        `SELECT COUNT(*)::int AS count
         FROM skill_packages pkg
         INNER JOIN skill_versions av
           ON av.id = pkg.active_version_id
          AND av.deleted_at IS NULL AND COALESCE(av.is_deleted, false) = false
         WHERE ${live('pkg')}
           AND pkg.status = 'active'
           AND pkg.active_version_id IS NOT NULL`,
      ) as Promise<Array<{ count: number }>>,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const skillRows: Array<{ id: number; publisher_id: number; name: string; version_id: number }> =
      total === 0
        ? []
        : await manager.query(
            `SELECT pkg.id, pkg.publisher_id, av.name, av.id AS version_id
             FROM skill_packages pkg
             INNER JOIN skill_versions av
               ON av.id = pkg.active_version_id
              AND av.deleted_at IS NULL AND COALESCE(av.is_deleted, false) = false
             WHERE ${live('pkg')}
               AND pkg.status = 'active'
               AND pkg.active_version_id IS NOT NULL
             ORDER BY av.name, pkg.id
             LIMIT $1 OFFSET $2`,
            [limit, offset],
          );

    const versionIds = skillRows.map((r) => Number(r.version_id));
    const linkRows: Array<{ skill_version_id: number; coworker_package_id: number }> = versionIds.length
      ? await manager.query(
          `SELECT vt.skill_version_id, vt.coworker_package_id
           FROM skill_version_coworkers vt
           WHERE vt.skill_version_id = ANY($1)
             AND ${live('vt')}`,
          [versionIds],
        )
      : [];

    const linksByVersion = new Map<number, Set<number>>();
    for (const row of linkRows) {
      const vid = Number(row.skill_version_id);
      const set = linksByVersion.get(vid) ?? new Set<number>();
      set.add(Number(row.coworker_package_id));
      linksByVersion.set(vid, set);
    }

    const publishers = await this.metaRead.getPublishersByIds(skillRows.map((r) => r.publisher_id));
    const colIds = columns.map((c) => Number(c.id));

    const rows: ReuseMatrixRow[] = skillRows.map((r) => {
      const linked = linksByVersion.get(Number(r.version_id)) ?? new Set<number>();
      const publisher = publishers.get(Number(r.publisher_id));
      return {
        id: Number(r.id),
        name: r.name,
        publisher: { id: Number(r.publisher_id), name: publisher?.name ?? null },
        cells: colIds.map((id) => linked.has(id)),
      };
    });

    return {
      columns: columns.map((c) => ({ id: Number(c.id), code: c.code, name: c.name })),
      rows,
      meta: { total, page, limit },
    };
  }
}
