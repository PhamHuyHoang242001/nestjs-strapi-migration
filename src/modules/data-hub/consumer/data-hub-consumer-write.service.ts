import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PromptAvatarUrlService } from '@modules/prompt-library/prompt-avatar-url.util';
import { DataHubServiceHistoryAction, DataHubStatus } from '@modules/databases/data-hub-enums';
import { isUniqueViolation } from '../common/data-hub-pg-error.util';
import { liveSql } from '../common/data-hub-query.util';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { sqlRows } from './consumer-sql.util';
import { loadSoAppUserIds, replaceSoApps } from './consumer-so-apps.util';
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
    private readonly avatarUrl: PromptAvatarUrlService,
  ) {}

  // The avatar is uploaded first (POST /v1/custom-upload) and its returned url sent here, as in the AI Hub
  // packages: only a url of the upload host is accepted (422 URL_NOT_ALLOWED / INVALID_URL otherwise).
  async create(dto: CreateConsumerDto, userId: number) {
    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.assertOwnerUnit(manager, dto.owner_unit_id);
        await this.assertSystem(manager, dto.system_id);
        await this.userRefs.assertUsers(manager, dto.so_app_user_ids);

        const snapshot = buildConsumerSnapshot({ ...dto, status: DataHubStatus.ACTIVE });
        const [row] = await sqlRows<{ id: number }>(
          manager,
          `INSERT INTO data_hub_consumers
             (code, name, category, owner_unit_id, short_description, avatar_url, status, version_no,
              created_by, system_id, system_service)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10)
           RETURNING id`,
          [
            snapshot.code,
            snapshot.name,
            snapshot.category,
            snapshot.owner_unit_id,
            snapshot.short_description,
            snapshot.avatar_url,
            snapshot.status,
            userId,
            snapshot.system_id,
            snapshot.system_service,
          ],
        );
        // Insert in the submitted order (snapshot ids are sorted) so display order matches the form.
        await replaceSoApps(manager, row.id, dto.so_app_user_ids);
        await this.writeHistory(manager, row.id, 1, DataHubServiceHistoryAction.CREATE, snapshot, userId);
        return { id: row.id, code: snapshot.code, version_no: 1 };
      });
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async update(id: number, dto: UpdateConsumerDto, userId: number) {
    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const current = await this.lockCurrent(manager, id);
        await this.assertOwnerUnit(manager, dto.owner_unit_id);
        await this.assertSystem(manager, dto.system_id);
        await this.userRefs.assertUsers(manager, dto.so_app_user_ids);

        // Status is not editable here; code is kept when left out. A code taken by another live app hits the
        // live-code unique index (409 below).
        const next = buildConsumerSnapshot({ ...dto, code: dto.code ?? current.code, status: current.status });
        if (snapshotsEqual(this.currentSnapshot(current), next)) throw new BadRequestException('NO_CHANGES');

        const versionNo = current.version_no + 1;
        await manager.query(
          `UPDATE data_hub_consumers
           SET name = $2, category = $3, owner_unit_id = $4, short_description = $5, avatar_url = $6,
               version_no = $7, updated_by = $8, updated_at = NOW(), code = $9, system_id = $10,
               system_service = $11
           WHERE id = $1`,
          [
            id,
            next.name,
            next.category,
            next.owner_unit_id,
            next.short_description,
            next.avatar_url,
            versionNo,
            userId,
            next.code,
            next.system_id,
            next.system_service,
          ],
        );
        await replaceSoApps(manager, id, dto.so_app_user_ids);
        await this.writeHistory(manager, id, versionNo, DataHubServiceHistoryAction.UPDATE, next, userId);
        return { id, version_no: versionNo };
      });
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
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
    const [row] = await sqlRows<Omit<SnapshotSource, 'so_app_user_ids'> & { id: number; version_no: number }>(
      manager,
      `SELECT c.id, c.code, c.name, c.category, c.owner_unit_id, c.short_description, c.avatar_url,
              c.status, c.version_no, c.system_id, c.system_service
       FROM data_hub_consumers c
       WHERE c.id = $1 AND ${liveSql('c')}
       FOR UPDATE`,
      [id],
    );
    if (!row) throw new NotFoundException('CONSUMER_NOT_FOUND');
    const soAppUserIds = (await loadSoAppUserIds(manager, [id])).get(id) ?? [];
    return {
      ...buildConsumerSnapshot({ ...row, so_app_user_ids: soAppUserIds }),
      id: Number(row.id),
      version_no: Number(row.version_no),
    };
  }

  private currentSnapshot(row: CurrentRow): ConsumerSnapshot {
    return buildConsumerSnapshot(row);
  }

  private async assertSystem(manager: EntityManager, systemId: number): Promise<void> {
    const [system] = await sqlRows<{ ok: number }>(
      manager,
      `SELECT 1 AS ok FROM data_hub_systems s WHERE s.id = $1 AND ${liveSql('s')}`,
      [systemId],
    );
    if (!system) throw new BadRequestException('INVALID_SYSTEM: system does not exist');
  }

  private async assertOwnerUnit(manager: EntityManager, ownerUnitId: number): Promise<void> {
    const [unit] = await sqlRows<{ ok: number }>(
      manager,
      `SELECT 1 AS ok FROM data_hub_owner_units u WHERE u.id = $1 AND ${liveSql('u')}`,
      [ownerUnitId],
    );
    if (!unit) throw new BadRequestException('INVALID_OWNER_UNIT: owner unit does not exist');
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
