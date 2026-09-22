import { PermissionQueryService } from '@common/authorization';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { Module as ModuleEntity } from '@modules/databases/module.entity';
import { Permission } from '@modules/databases/permission.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { HIERARCHY_MAP, RULE_TARGET_TABLES } from '../constants/hierarchy-config';
import { RecordSubjectsQueryDto } from '../dto/record-subjects-query.dto';

const READ_ACTION = 'read';

@Injectable()
export class RecordSubjectsService {
  constructor(
    private readonly permissionQuery: PermissionQueryService,
    @InjectRepository(ModuleEntity)
    private readonly moduleRepo: Repository<ModuleEntity>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    private readonly connection: DataSource,
  ) {}

  async listRoles(query: RecordSubjectsQueryDto, pagination: PaginationParams) {
    const { parentTable, viewCode, childTable } = await this.resolveParentView(query.table);
    const page = await this.permissionQuery.listRolesForRecordPaged(parentTable, query.data_id, viewCode, {
      search: query.search,
      skip: pagination.skip ?? 0,
      take: pagination.limit,
    });
    const ids = page.items.map((r) => r.id);
    const [permRows, countRows] = await Promise.all([
      this.loadChildPermissions(ids, childTable),
      this.loadUserCounts(ids),
    ]);
    const permsByRole = new Map<number, { id: number; code: string; action: string }[]>();
    for (const row of permRows) {
      const list = permsByRole.get(row.role_id) ?? [];
      list.push({ id: Number(row.id), code: row.code, action: row.action });
      permsByRole.set(row.role_id, list);
    }
    const countByRole = new Map<number, number>();
    for (const row of countRows) countByRole.set(Number(row.role_id), Number(row.user_count));

    return {
      items: page.items.map((r) => ({
        id: r.id,
        name: r.name,
        user_count: countByRole.get(r.id) ?? 0,
        permissions: permsByRole.get(r.id) ?? [],
      })),
      total: page.total,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  async listUsers(query: RecordSubjectsQueryDto, pagination: PaginationParams) {
    const { parentTable, viewCode } = await this.resolveParentView(query.table);
    const page = await this.permissionQuery.listUsersForRecordPaged(parentTable, query.data_id, viewCode, {
      search: query.search,
      skip: pagination.skip ?? 0,
      take: pagination.limit,
    });
    return {
      items: page.items,
      total: page.total,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  private async resolveParentView(childTable: string): Promise<{
    parentTable: string;
    viewCode: string;
    childTable: string;
  }> {
    const entry = HIERARCHY_MAP[childTable];
    if (entry === undefined) {
      throw new BadRequestException('Invalid data-access table');
    }
    if (entry === null) {
      throw new BadRequestException('Table has no parent');
    }
    if (!RULE_TARGET_TABLES.has(entry.parentTable)) {
      throw new BadRequestException('Parent table is not a rule target');
    }

    const parentModule = await this.moduleRepo.findOne({ where: { table_name: entry.parentTable } });
    if (!parentModule) throw new BadRequestException('Parent module not found');

    const reads = await this.permissionRepo.find({
      where: { module_id: parentModule.id, action: READ_ACTION, is_active: true },
    });
    const active = reads.filter((p) => !p.deleted_at);
    if (active.length !== 1) {
      throw new BadRequestException('Parent module must have exactly one read permission');
    }

    return { parentTable: entry.parentTable, viewCode: active[0].code, childTable };
  }

  private async loadChildPermissions(
    roleIds: number[],
    childTable: string,
  ): Promise<{ role_id: number; id: number; code: string; action: string }[]> {
    if (!roleIds.length) return [];
    return this.connection.query(
      `
      SELECT rp.role_id, p.id, p.code, p.action
      FROM roles_permissions rp
      INNER JOIN permission p ON p.id = rp.permission_id
      INNER JOIN modules m ON m.id = p.module_id
      WHERE rp.role_id = ANY($1)
        AND rp.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND p.is_active = true
        AND m.table_name = $2
      ORDER BY p.id
      `,
      [roleIds, childTable],
    );
  }

  private async loadUserCounts(roleIds: number[]): Promise<{ role_id: number; user_count: number }[]> {
    if (!roleIds.length) return [];
    return this.connection.query(
      `
      SELECT ur.role_id, COUNT(*)::int AS user_count
      FROM user_roles ur
      INNER JOIN users u ON u.id = ur.user_id
      WHERE ur.role_id = ANY($1)
        AND ur.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND u.is_deleted IS NOT TRUE
      GROUP BY ur.role_id
      `,
      [roleIds],
    );
  }
}
