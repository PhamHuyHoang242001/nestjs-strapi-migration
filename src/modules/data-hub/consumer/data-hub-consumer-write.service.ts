import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DataHubServiceHistoryAction, DataHubStatus } from '@modules/databases/data-hub-enums';
import { isUniqueViolation } from '../common/data-hub-pg-error.util';
import { liveSql } from '../common/data-hub-query.util';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { sqlRows } from './consumer-sql.util';
import { loadBusinessContactUserIds, replaceBusinessContacts } from './consumer-business-contacts.util';
import { buildConsumerSnapshot, ConsumerSnapshot, snapshotsEqual } from './consumer-snapshot.util';
import { CreateConsumerDto, UpdateConsumerDto } from './dto';

const CODE_CONSTRAINT = 'uq_data_hub_consumers_code_live';

type SnapshotSource = Parameters<typeof buildConsumerSnapshot>[0];
type CurrentRow = ConsumerSnapshot & { id: number; version_no: number };

@Injectable()
export class DataHubConsumerWriteService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  async create(dto: CreateConsumerDto, userId: number) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.assertOrg(manager, dto.division_id, dto.department_id ?? null);
        await this.userRefs.assertUsers(manager, dto.business_contact_user_ids);

        const snapshot = buildConsumerSnapshot({ ...dto, status: DataHubStatus.ACTIVE });
        const [row] = await sqlRows<{ id: number }>(
          manager,
          `INSERT INTO data_hub_consumers
             (code, name, category, division_id, department_id, short_description, status, version_no,
              created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)
           RETURNING id`,
          [
            snapshot.code,
            snapshot.name,
            snapshot.category,
            snapshot.division_id,
            snapshot.department_id,
            snapshot.short_description,
            snapshot.status,
            userId,
          ],
        );
        // Insert in the submitted order (snapshot ids are sorted) so display order matches the form.
        await replaceBusinessContacts(manager, row.id, dto.business_contact_user_ids);
        await this.writeHistory(manager, row.id, 1, DataHubServiceHistoryAction.CREATE, snapshot, userId);
        return { id: row.id, code: snapshot.code, version_no: 1 };
      });
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async update(id: number, dto: UpdateConsumerDto, userId: number) {
    return this.dataSource.transaction(async (manager) => {
      const current = await this.lockCurrent(manager, id);
      await this.assertOrg(manager, dto.division_id, dto.department_id ?? null);
      await this.userRefs.assertUsers(manager, dto.business_contact_user_ids);

      // Code and status are not editable here; carry them over from the stored row.
      const next = buildConsumerSnapshot({ ...dto, code: current.code, status: current.status });
      if (snapshotsEqual(this.currentSnapshot(current), next)) throw new BadRequestException('NO_CHANGES');

      const versionNo = current.version_no + 1;
      await manager.query(
        `UPDATE data_hub_consumers
         SET name = $2, category = $3, division_id = $4, department_id = $5, short_description = $6,
             version_no = $7, updated_by = $8, updated_at = NOW()
         WHERE id = $1`,
        [id, next.name, next.category, next.division_id, next.department_id, next.short_description, versionNo, userId],
      );
      await replaceBusinessContacts(manager, id, dto.business_contact_user_ids);
      await this.writeHistory(manager, id, versionNo, DataHubServiceHistoryAction.UPDATE, next, userId);
      return { id, version_no: versionNo };
    });
  }

  async updateStatus(id: number, status: DataHubStatus, userId: number) {
    return this.dataSource.transaction(async (manager) => {
      const current = await this.lockCurrent(manager, id);
      if (current.status === (status as string)) throw new BadRequestException('NO_CHANGES');

      const versionNo = current.version_no + 1;
      await manager.query(
        `UPDATE data_hub_consumers SET status = $2, version_no = $3, updated_by = $4, updated_at = NOW()
         WHERE id = $1`,
        [id, status, versionNo, userId],
      );
      const snapshot = { ...this.currentSnapshot(current), status };
      await this.writeHistory(manager, id, versionNo, DataHubServiceHistoryAction.STATUS, snapshot, userId);
      return { id, status, version_no: versionNo };
    });
  }

  // Row lock serializes concurrent edits so version_no never skips or collides.
  private async lockCurrent(manager: EntityManager, id: number): Promise<CurrentRow> {
    const [row] = await sqlRows<Omit<SnapshotSource, 'business_contact_user_ids'> & { id: number; version_no: number }>(
      manager,
      `SELECT c.id, c.code, c.name, c.category, c.division_id, c.department_id, c.short_description,
              c.status, c.version_no
       FROM data_hub_consumers c
       WHERE c.id = $1 AND ${liveSql('c')}
       FOR UPDATE`,
      [id],
    );
    if (!row) throw new NotFoundException('CONSUMER_NOT_FOUND');
    const contactUserIds = (await loadBusinessContactUserIds(manager, [id])).get(id) ?? [];
    return {
      ...buildConsumerSnapshot({ ...row, business_contact_user_ids: contactUserIds }),
      id: Number(row.id),
      version_no: Number(row.version_no),
    };
  }

  private currentSnapshot(row: CurrentRow): ConsumerSnapshot {
    return buildConsumerSnapshot(row);
  }

  private async assertOrg(manager: EntityManager, divisionId: number, departmentId: number | null): Promise<void> {
    const [division] = await sqlRows<{ ok: number }>(
      manager,
      `SELECT 1 AS ok FROM data_hub_divisions d WHERE d.id = $1 AND ${liveSql('d')}`,
      [divisionId],
    );
    if (!division) throw new BadRequestException('INVALID_DIVISION: division does not exist');
    if (departmentId === null) return;
    // Share lock: a concurrent department delete (FOR UPDATE) waits, so it sees this consumer as a reference.
    const [department] = await sqlRows<{ ok: number }>(
      manager,
      `SELECT 1 AS ok FROM data_hub_departments d WHERE d.id = $1 AND ${liveSql('d')} FOR SHARE`,
      [departmentId],
    );
    if (!department) throw new BadRequestException('INVALID_DEPARTMENT: department does not exist');
  }

  private async writeHistory(
    manager: EntityManager,
    consumerId: number,
    versionNo: number,
    action: DataHubServiceHistoryAction,
    snapshot: ConsumerSnapshot,
    userId: number,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO data_hub_consumer_histories (consumer_id, version_no, action, snapshot, changed_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [consumerId, versionNo, action, JSON.stringify(snapshot), userId],
    );
  }

  private mapUniqueViolation(err: unknown): unknown {
    return isUniqueViolation(err, CODE_CONSTRAINT)
      ? new ConflictException('CONSUMER_CODE_EXISTS: consumer code already exists')
      : err;
  }
}
