import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { isUniqueViolation } from '../common/data-hub-pg-error.util';
import { liveSql, returningRows } from '../common/data-hub-query.util';
import { holderIdsAmong } from './data-service-right-holders.util';
import { DepartmentConfigBodyDto } from './dto';

const CODE_UNIQUE = 'uq_data_hub_departments_code_live';

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

  // A department referenced by a live data service (through its active version) or a live consumer stays.
  async remove(id: number, userId: number): Promise<{ id: number; deleted: true }> {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, id, 'UPDATE');
      const [services]: Array<{ n: number }> = await manager.query(
        `SELECT COUNT(*)::int AS n FROM data_hub_data_services s
         JOIN data_hub_data_service_versions v ON v.id = s.active_version_id
         WHERE ${liveSql('s')} AND v.department_id = $1`,
        [id],
      );
      const [consumers]: Array<{ n: number }> = await manager.query(
        `SELECT COUNT(*)::int AS n FROM data_hub_consumers c WHERE ${liveSql('c')} AND c.department_id = $1`,
        [id],
      );
      if (Number(services?.n ?? 0) > 0 || Number(consumers?.n ?? 0) > 0) {
        throw new ConflictException('DEPARTMENT_IN_USE');
      }
      await manager.query(
        `UPDATE data_hub_departments SET deleted_at = NOW(), is_deleted = true, updated_by = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, userId],
      );
      await manager.query('DELETE FROM data_hub_department_members WHERE department_id = $1', [id]);
      return { id, deleted: true as const };
    });
  }

  // Only users holding a data-service right can be members; existing pairs are ignored.
  async addMembers(id: number, userIds: number[], userId: number): Promise<{ id: number; added: number }> {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, id, 'SHARE');
      await this.userRefs.assertUsers(manager, userIds);
      const holders = await holderIdsAmong(manager, userIds);
      const invalid = userIds.filter((u) => !holders.has(u));
      if (invalid.length > 0) throw new BadRequestException(`INVALID_MEMBERS: ${invalid.join(', ')}`);
      const inserted = returningRows<{ user_id: number }>(
        await manager.query(
          `INSERT INTO data_hub_department_members (department_id, user_id, created_by)
           SELECT $1, u, $3 FROM UNNEST($2::int[]) AS t(u)
           ON CONFLICT (department_id, user_id) DO NOTHING
           RETURNING user_id`,
          [id, userIds, userId],
        ),
      );
      return { id, added: inserted.length };
    });
  }

  async removeMember(id: number, memberUserId: number): Promise<{ id: number; user_id: number; removed: true }> {
    const deleted = returningRows<{ id: number }>(
      await this.dataSource.query(
        'DELETE FROM data_hub_department_members WHERE department_id = $1 AND user_id = $2 RETURNING id',
        [id, memberUserId],
      ),
    );
    if (deleted.length === 0) throw new NotFoundException('MEMBER_NOT_FOUND');
    return { id, user_id: memberUserId, removed: true };
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
