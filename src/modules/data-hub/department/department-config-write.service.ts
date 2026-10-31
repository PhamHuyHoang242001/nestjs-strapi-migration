import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { isUniqueViolation } from '../common/data-hub-pg-error.util';
import { liveSql, returningRows } from '../common/data-hub-query.util';
import { holderIdsAmong } from './data-service-right-holders.util';
import { DepartmentConfigBodyDto } from './dto';

const CODE_UNIQUE = 'uq_data_hub_departments_code_live';

// SET clause of a member soft delete; $2 = the user deleting.
const MEMBER_SOFT_DELETE = `deleted_at = NOW(), is_deleted = true, deleted_by = $2, updated_by = $2, updated_at = NOW()`;

interface LockedDepartment {
  id: number;
  code: string;
  name: string;
}

// Department catalog (Đơn vị phát hành) and its members. Writes lock the department row:
// - FOR UPDATE for edit/delete, so a delete cannot interleave with a data-service write or a member add
//   (those take FOR SHARE on the same row) and leave references to a deleted department;
// - FOR SHARE for member adds.
@Injectable()
export class DepartmentConfigWriteService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  async create(dto: DepartmentConfigBodyDto, userId: number): Promise<{ id: number }> {
    try {
      const rows: Array<{ id: number }> = await this.dataSource.query(
        `INSERT INTO data_hub_departments (code, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [dto.code, dto.name, userId],
      );
      return { id: Number(rows[0].id) };
    } catch (err) {
      this.rethrowCodeConflict(err);
    }
  }

  async update(id: number, dto: DepartmentConfigBodyDto, userId: number): Promise<{ id: number }> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const current = await this.lock(manager, id, 'UPDATE');
        if (current.code === dto.code && current.name === dto.name) throw new BadRequestException('NO_CHANGES');
        await manager.query(
          `UPDATE data_hub_departments SET code = $2, name = $3, updated_by = $4, updated_at = NOW() WHERE id = $1`,
          [id, dto.code, dto.name, userId],
        );
        return { id };
      });
    } catch (err) {
      this.rethrowCodeConflict(err);
    }
  }

  // A department referenced by a live data service (through its active version) stays.
  async remove(id: number, userId: number): Promise<{ id: number; deleted: true }> {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, id, 'UPDATE');
      const [services]: Array<{ n: number }> = await manager.query(
        `SELECT COUNT(*)::int AS n FROM data_hub_data_services s
         JOIN data_hub_data_service_versions v ON v.id = s.active_version_id
         WHERE ${liveSql('s')} AND v.department_id = $1`,
        [id],
      );
      if (Number(services?.n ?? 0) > 0) {
        throw new ConflictException('DEPARTMENT_IN_USE');
      }
      await manager.query(
        `UPDATE data_hub_departments SET deleted_at = NOW(), is_deleted = true, updated_by = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, userId],
      );
      await manager.query(
        `UPDATE data_hub_department_members m SET ${MEMBER_SOFT_DELETE}
         WHERE m.department_id = $1 AND ${liveSql('m')}`,
        [id, userId],
      );
      return { id, deleted: true as const };
    });
  }

  // Only users holding a data-service right can be members. A live pair is left as is; a soft-deleted pair is
  // revived as a new membership (author and timestamps reset). `added` counts inserted + revived rows.
  async addMembers(id: number, userIds: number[], userId: number): Promise<{ id: number; added: number }> {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, id, 'SHARE');
      await this.userRefs.assertUsers(manager, userIds);
      const holders = await holderIdsAmong(manager, userIds);
      const invalid = userIds.filter((u) => !holders.has(u));
      if (invalid.length > 0) throw new BadRequestException(`INVALID_MEMBERS: ${invalid.join(', ')}`);
      const inserted = returningRows<{ user_id: number }>(
        await manager.query(
          `INSERT INTO data_hub_department_members AS m (department_id, user_id, created_by, updated_by)
           SELECT $1, u, $3, $3 FROM UNNEST($2::int[]) AS t(u)
           ON CONFLICT (department_id, user_id) DO UPDATE
             SET deleted_at = NULL, is_deleted = false, deleted_by = NULL,
                 created_by = $3, updated_by = $3, created_at = NOW(), updated_at = NOW()
             WHERE NOT (${liveSql('m')})
           RETURNING user_id`,
          [id, userIds, userId],
        ),
      );
      return { id, added: inserted.length };
    });
  }

  // Soft delete. Ids that are not live members are ignored; 404 only when none of them was a member.
  async removeMembers(
    id: number,
    userIds: number[],
    userId: number,
  ): Promise<{ id: number; removed: number; user_ids: number[] }> {
    const deleted = returningRows<{ user_id: number }>(
      await this.dataSource.query(
        `UPDATE data_hub_department_members m SET ${MEMBER_SOFT_DELETE}
         WHERE m.department_id = $1 AND m.user_id = ANY($3::int[]) AND ${liveSql('m')}
         RETURNING m.user_id`,
        [id, userId, userIds],
      ),
    );
    if (deleted.length === 0) throw new NotFoundException('MEMBER_NOT_FOUND');
    const removedIds = deleted.map((r) => Number(r.user_id));
    return { id, removed: removedIds.length, user_ids: removedIds };
  }

  private async lock(manager: EntityManager, id: number, mode: 'UPDATE' | 'SHARE'): Promise<LockedDepartment> {
    const rows: LockedDepartment[] = await manager.query(
      `SELECT d.id, d.code, d.name FROM data_hub_departments d WHERE d.id = $1 AND ${liveSql('d')} FOR ${mode}`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('DEPARTMENT_NOT_FOUND');
    return rows[0];
  }

  private rethrowCodeConflict(err: unknown): never {
    if (isUniqueViolation(err, CODE_UNIQUE)) throw new ConflictException('DEPARTMENT_CODE_EXISTS');
    throw err;
  }
}
