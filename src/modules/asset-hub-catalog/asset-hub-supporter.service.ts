import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AI_HUB_PACKAGE_TABLE_BY_TYPE,
  AI_HUB_SUPPORTER_UPLOAD_CODE,
  canManageSupporters,
  type AiHubArtifactType,
} from './ai-hub-package-access.helper';
import { AssetHubItemMetaService } from './asset-hub-item-meta.service';
import type { DirectoryPage, DirectoryUser } from './asset-hub-user-directory.service';

// Users eligible as supporters of a workspace: live users holding that workspace's upload code,
// through an active role or an in-window ALLOW exception grant — the same two sources
// PermissionQueryService.getUserPermissions reads — plus super_admin, whom PermissionGuard lets
// upload without holding the code. So "eligible" matches what the upload gate lets through.
// `$1` is the upload code; the caller aliases the users table as `u`.
const HOLDS_UPLOAD_CODE_SQL = `(
  u.type = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role r ON r.id = ur.role_id AND r.status = 'active' AND r.deleted_at IS NULL
    JOIN roles_permissions rp ON rp.role_id = r.id AND rp.deleted_at IS NULL
    JOIN permission p ON p.id = rp.permission_id AND p.is_active = true AND p.deleted_at IS NULL
    WHERE ur.user_id = u.id AND ur.deleted_at IS NULL AND p.code = $1
  )
  OR EXISTS (
    SELECT 1 FROM data_access_users dau
    JOIN data_access da ON da.id = dau.data_access_id
    JOIN permission p ON p.id = dau.permission_id AND p.is_active = true AND p.deleted_at IS NULL
    WHERE dau.user_id = u.id AND dau.deleted_at IS NULL
      AND da.scope_type = 'allow' AND da.deleted_at IS NULL
      AND (da.start_date IS NULL OR da.start_date::date <= CURRENT_DATE)
      AND (da.end_date IS NULL OR da.end_date::date >= CURRENT_DATE)
      AND p.code = $1
  )
)`;

const LIVE_USER_SQL = `u.deleted_at IS NULL AND COALESCE(u.is_deleted, false) = false AND u.email IS NOT NULL`;

// Supporter management, decoupled from package create/bump/edit: one full-replace write gated on
// creator ∨ current supporter, plus the picker of users who may be added.
@Injectable()
export class AssetHubSupporterService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly itemMeta: AssetHubItemMetaService,
  ) {}

  // Paged id + email of users eligible as supporters. Prompt: every live user.
  async listCandidates(
    type: AiHubArtifactType,
    params: { page?: number; limit?: number; search?: string },
  ): Promise<DirectoryPage> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const code = AI_HUB_SUPPORTER_UPLOAD_CODE[type];

    // HOLDS_UPLOAD_CODE_SQL binds the code as $1, so it is pushed first when present.
    const args: unknown[] = [];
    let where = LIVE_USER_SQL;
    if (code) {
      args.push(code);
      where += ` AND ${HOLDS_UPLOAD_CODE_SQL}`;
    }
    const keyword = params.search?.trim();
    if (keyword) {
      args.push(`%${keyword}%`);
      where += ` AND u.email ILIKE $${args.length}`;
    }

    const countRows: Array<{ total: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM users u WHERE ${where}`,
      args,
    );
    const rowArgs = [...args, limit, (page - 1) * limit];
    const rows: DirectoryUser[] = await this.dataSource.query(
      `SELECT u.id, u.email FROM users u WHERE ${where}
       ORDER BY u.email ASC LIMIT $${rowArgs.length - 1} OFFSET $${rowArgs.length}`,
      rowArgs,
    );

    return {
      data: rows.map((u) => ({ id: Number(u.id), email: u.email })),
      meta: { total: Number(countRows[0]?.total ?? 0), page, limit },
    };
  }

  // Replace the package's supporter set. Caller must be the creator or a current supporter; every
  // new id must be an eligible user. Row lock serializes concurrent replaces on the same package.
  async replaceSupporters(type: AiHubArtifactType, packageId: number, supporterIds: number[], userId: number) {
    const table = AI_HUB_PACKAGE_TABLE_BY_TYPE[type];

    return this.dataSource.transaction(async (manager) => {
      const pkgRows: Array<{ id: number; created_by: number }> = await manager.query(
        `SELECT id, created_by FROM ${table}
         WHERE id = $1 AND deleted_at IS NULL AND is_deleted IS NOT TRUE
         FOR UPDATE`,
        [packageId],
      );
      const pkg = pkgRows[0];
      if (!pkg) throw new NotFoundException('Package not found');

      const current = await this.itemMeta.listSupporterIds(manager, type, packageId);
      if (!canManageSupporters({ userId, createdBy: Number(pkg.created_by), supporterIds: current })) {
        throw new ForbiddenException('Only the package creator or a current supporter can manage supporters');
      }

      const ids = await this.itemMeta.assertSupporterUsers(manager, supporterIds);
      await this.assertEligible(manager, type, ids);
      await this.itemMeta.replaceSupporters(manager, type, packageId, ids);

      const supporters: DirectoryUser[] = ids.length
        ? await manager.query(`SELECT id, email FROM users WHERE id = ANY($1) ORDER BY email ASC`, [ids])
        : [];
      return { id: packageId, supporters: supporters.map((u) => ({ id: Number(u.id), email: u.email })) };
    });
  }

  // Every id must be a candidate: the same predicate listCandidates uses, so nobody can be added who
  // the picker would not show. Prompt has no upload code: any live user with an email qualifies.
  private async assertEligible(manager: EntityManager, type: AiHubArtifactType, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const code = AI_HUB_SUPPORTER_UPLOAD_CODE[type];

    const rows: Array<{ id: number }> = code
      ? await manager.query(
          `SELECT u.id FROM users u WHERE u.id = ANY($2) AND ${LIVE_USER_SQL} AND ${HOLDS_UPLOAD_CODE_SQL}`,
          [code, ids],
        )
      : await manager.query(`SELECT u.id FROM users u WHERE u.id = ANY($1) AND ${LIVE_USER_SQL}`, [ids]);
    const eligible = new Set(rows.map((r) => Number(r.id)));
    const rejected = ids.filter((id) => !eligible.has(id));
    if (rejected.length) {
      const reason = code ? `users without ${code}` : 'users not eligible';
      throw new BadRequestException(`INVALID_SUPPORTERS: ${reason}: ${rejected.join(', ')}`);
    }
  }
}
