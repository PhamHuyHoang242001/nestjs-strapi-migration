import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillVersion } from '@modules/databases/skill-version.entity';
import { LATEST_ARTIFACTS_LIMIT } from '@configuration/env.config';

// The literal artifact kinds surfaced by the feed. Kept as a string union so the `type` field is a
// stable public discriminator ('skill' | 'prompt') the client can switch on.
export type ArtifactType = 'skill' | 'prompt' | 'api-catalog';

// Public shape of one feed item — exactly the fields the request asks for and nothing else.
// `created_at` is the LATEST version's creation timestamp ("ngày tạo"); `created_by` is that
// version's submitter email ("người tạo"). `version`/`state`/`name`/`description` all come from the
// latest version, so a package whose newest version is still pending reports state='pending'.
export interface LatestArtifactItem {
  code: string;
  version: number;
  created_at: Date | string;
  name: string;
  description: string;
  type: ArtifactType;
  state: string;
  created_by: string | null;
}

// One workspace's dashboard counters. `type` is the discriminator the client switches on, so both
// workspaces can be rendered from a single response.
export interface WorkspaceStatRow {
  type: ArtifactType;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  published: number;
}

// Internal row shape returned by the per-type SQL before email resolution + reshaping.
interface LatestVersionRow {
  code: string;
  version_no: number;
  created_at: Date | string;
  name: string;
  short_description: string;
  state: string;
  submitted_by: number;
}

@Injectable()
export class LatestArtifactsService {
  // Injected only to borrow its EntityManager for parameter-bound raw queries across the
  // skill_versions / prompt_versions / users tables (same pattern as the two query services).
  constructor(
    @InjectRepository(SkillVersion)
    private readonly versionRepo: Repository<SkillVersion>,
  ) {}

  // Resolve user ids → email for the "người tạo" display field. One batched, deduped, null-safe
  // query; ids with no matching user row are simply absent from the returned Map.
  private async resolveEmails(ids: number[]): Promise<Map<number, string>> {
    const unique = Array.from(new Set(ids));
    if (!unique.length) return new Map();
    const rows = (await this.versionRepo.manager.query('SELECT id, email FROM users WHERE id = ANY($1)', [
      unique,
    ])) as Array<{ id: number; email: string }>;
    return new Map(rows.map((r) => [Number(r.id), r.email]));
  }

  // Fetch the latest version PER package for one artifact type, newest first, capped at `limit`.
  // DISTINCT ON (<pkg fk>) ... ORDER BY <pkg fk>, v.id DESC keeps exactly one row per package — its
  // most-recent version (recency by surrogate id, matching the modules' locked convention). The
  // outer wrapper then ranks those winners by created_at so the feed shows the freshest activity.
  // `versionTable`/`packageTable`/`fkColumn` are hardcoded identifiers (never user input) — safe to
  // interpolate; the LIMIT value is parameter-bound.
  private async fetchLatestPerPackage(
    versionTable: string,
    packageTable: string,
    fkColumn: string,
    limit: number,
  ): Promise<LatestVersionRow[]> {
    const rows: LatestVersionRow[] = await this.versionRepo.manager.query(
      `SELECT latest.code, latest.version_no, latest.created_at, latest.name,
              latest.short_description, latest.state, latest.submitted_by
       FROM (
         SELECT DISTINCT ON (v.${fkColumn})
           p.code, v.version_no, v.created_at, v.name, v.short_description, v.state, v.submitted_by
         FROM ${versionTable} v
         INNER JOIN ${packageTable} p ON p.id = v.${fkColumn}
         WHERE v.is_deleted = false AND v.deleted_at IS NULL
           AND p.is_deleted = false AND p.deleted_at IS NULL
         ORDER BY v.${fkColumn}, v.id DESC
       ) latest
       ORDER BY latest.created_at DESC, latest.version_no DESC
       LIMIT $1`,
      [limit],
    );
    return rows;
  }

  // Dashboard counters for one workspace. Each live package contributes exactly once to the
  // lifecycle counters via its greatest live version id. Published is intentionally separate: a
  // package may remain published while a newer update is pending or rejected.
  // The table/column names are hardcoded internal identifiers (never user input).
  private async fetchWorkspaceStats(
    type: ArtifactType,
    versionTable: string,
    packageTable: string,
    fkColumn: string,
  ): Promise<WorkspaceStatRow> {
    const rows = (await this.versionRepo.manager.query(`
      WITH latest AS (
        SELECT DISTINCT ON (v.${fkColumn}) v.state
        FROM ${versionTable} v
        INNER JOIN ${packageTable} p ON p.id = v.${fkColumn}
        WHERE v.deleted_at IS NULL AND v.is_deleted = false
          AND p.deleted_at IS NULL AND p.is_deleted = false
        ORDER BY v.${fkColumn}, v.id DESC
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE state = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE state = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE state = 'rejected')::int AS rejected,
        (
          SELECT COUNT(*)::int
          FROM ${packageTable} p
          INNER JOIN ${versionTable} av
            ON av.id = p.active_version_id
           AND av.${fkColumn} = p.id
           AND av.state = 'approved'
           AND av.deleted_at IS NULL
           AND av.is_deleted = false
          WHERE p.status = 'active'
            AND p.active_version_id IS NOT NULL
            AND p.deleted_at IS NULL
            AND p.is_deleted = false
        ) AS published
      FROM latest
    `)) as Array<Record<'total' | 'pending' | 'approved' | 'rejected' | 'published', number | string>>;

    const row = rows[0];
    return {
      type,
      total: Number(row?.total ?? 0),
      pending: Number(row?.pending ?? 0),
      approved: Number(row?.approved ?? 0),
      rejected: Number(row?.rejected ?? 0),
      published: Number(row?.published ?? 0),
    };
  }

  // GET /v1/asset-hub/stats — both workspaces' counters in one array, so the dashboard makes a
  // single request. This replaces the per-workspace GET /v1/skill/stats and GET /v1/prompt/stats;
  // the SQL was moved here rather than injected, because neither library module exports its query
  // service. The classification is unchanged — only the transport and the response shape differ.
  async listStats(): Promise<{ data: WorkspaceStatRow[] }> {
    const [skills, prompts, apiCatalogs] = await Promise.all([
      this.fetchWorkspaceStats('skill', 'skill_versions', 'skill_packages', 'skill_package_id'),
      this.fetchWorkspaceStats('prompt', 'prompt_versions', 'prompt_packages', 'prompt_package_id'),
      this.fetchWorkspaceStats('api-catalog', 'api_catalog_versions', 'api_catalog_packages', 'api_catalog_package_id'),
    ]);
    return { data: [skills, prompts, apiCatalogs] };
  }

  // GET /v1/asset-hub/latest — the N newest skills + N newest prompts, each carrying its latest
  // version's fields. N = the optional per-request override, else the configured default. Returns
  // both groups so the client can render "Skill mới nhất" and "Prompt mới nhất" sections separately.
  async listLatest(limitOverride?: number): Promise<{
    data: { skills: LatestArtifactItem[]; prompts: LatestArtifactItem[]; apiCatalogs: LatestArtifactItem[] };
    meta: { limit: number };
  }> {
    const limit = limitOverride ?? LATEST_ARTIFACTS_LIMIT;

    const [skillRows, promptRows, apiRows] = await Promise.all([
      this.fetchLatestPerPackage('skill_versions', 'skill_packages', 'skill_package_id', limit),
      this.fetchLatestPerPackage('prompt_versions', 'prompt_packages', 'prompt_package_id', limit),
      this.fetchLatestPerPackage('api_catalog_versions', 'api_catalog_packages', 'api_catalog_package_id', limit),
    ]);

    const emailMap = await this.resolveEmails([
      ...skillRows.map((r) => r.submitted_by),
      ...promptRows.map((r) => r.submitted_by),
      ...apiRows.map((r) => r.submitted_by),
    ]);

    const shape = (row: LatestVersionRow, type: ArtifactType): LatestArtifactItem => ({
      code: row.code,
      version: Number(row.version_no),
      created_at: row.created_at,
      name: row.name,
      description: row.short_description,
      type,
      state: row.state,
      created_by: emailMap.get(Number(row.submitted_by)) ?? null,
    });

    return {
      data: {
        skills: skillRows.map((r) => shape(r, 'skill')),
        prompts: promptRows.map((r) => shape(r, 'prompt')),
        apiCatalogs: apiRows.map((r) => shape(r, 'api-catalog')),
      },
      meta: { limit },
    };
  }
}
