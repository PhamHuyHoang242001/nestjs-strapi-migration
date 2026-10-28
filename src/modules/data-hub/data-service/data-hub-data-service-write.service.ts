import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DataHubServiceHistoryAction, DataHubServiceType, DataHubStatus } from '@modules/databases/data-hub-enums';
import { DataHubAccessService, DataHubCaller } from '../common/data-hub-access.service';
import { isUniqueViolation } from '../common/data-hub-pg-error.util';
import { liveSql } from '../common/data-hub-query.util';
import { LogicalTermHistoryService } from '../dictionary/logical-term-history.service';
import { CreateDataServiceDto, UpdateDataServiceDto } from './dto';
import { buildServiceCode, reserveServiceId } from './data-service-code.util';
import { diffSnapshots, singleFieldChange } from './data-service-diff.util';
import { DataServiceSnapshotService } from './data-service-snapshot.service';
import { buildSnapshot, ResolvedRefs } from './data-service-snapshot.util';
import { syncSourceTables } from './data-service-source-tables.util';
import { VersionSource } from './data-service-spec.types';
import { insertApprovedVersion, insertServiceHistory } from './data-service-version-writer.util';

export interface DataServiceWriteResult {
  id: number;
  service_code: string;
  version_id: number;
  version_no: number;
}

interface LockedService {
  id: number;
  service_code: string;
  service_type: DataHubServiceType;
  status: DataHubStatus;
  active_version_id: number;
  department_id: number | null;
}

// Exactly the spec matching the type; the other one must be absent.
function assertSpecMatchesType(type: DataHubServiceType, dto: { api_spec?: unknown; sftp_spec?: unknown }): void {
  const hasApi = dto.api_spec !== undefined && dto.api_spec !== null;
  const hasSftp = dto.sftp_spec !== undefined && dto.sftp_spec !== null;
  const ok = type === DataHubServiceType.API ? hasApi && !hasSftp : hasSftp && !hasApi;
  if (!ok) {
    const needed = type === DataHubServiceType.API ? 'api_spec' : 'sftp_spec';
    throw new BadRequestException(`SPEC_MISMATCH: service_type ${type} requires only ${needed}`);
  }
}

// Physical term ids are filled in once the service's source tables and terms have been written.
const toSource = (dto: CreateDataServiceDto | UpdateDataServiceDto): VersionSource => ({
  ...dto,
  usage_guide_html: dto.usage_guide_html ?? '',
  physical_term_ids: [],
});

// Unique indexes that can still fire when two requests race past the pre-checks.
function rethrowConflict(err: unknown, fallback: string): never {
  if (isUniqueViolation(err, 'uq_data_hub_source_tables_name_live')) {
    throw new ConflictException('SOURCE_TABLE_NAME_EXISTS');
  }
  if (isUniqueViolation(err, 'uq_data_hub_physical_terms_table_code_live')) {
    throw new ConflictException('PHYSICAL_CODE_EXISTS');
  }
  if (isUniqueViolation(err)) throw new ConflictException(fallback);
  throw err;
}

@Injectable()
export class DataHubDataServiceWriteService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly snapshots: DataServiceSnapshotService,
    private readonly access: DataHubAccessService,
    private readonly logicalHistory: LogicalTermHistoryService,
  ) {}

  // The caller must belong to the chosen department (Đơn vị phát hành); the role code is checked by the guard.
  async create(dto: CreateDataServiceDto, caller: DataHubCaller): Promise<DataServiceWriteResult> {
    const source = toSource(dto);
    const userId = caller.id;
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Department first, so a caller outside it gets 403 whatever the payload looks like.
        await this.access.assertDepartmentWrite(caller, [dto.department_id], manager);
        assertSpecMatchesType(dto.service_type, dto);
        const refs = await this.snapshots.resolveRefs(manager, source, true);
        const dataServiceId = await reserveServiceId(manager);
        const serviceCode = buildServiceCode(
          dto.service_type,
          refs.division?.label ?? '',
          refs.department?.label ?? '',
          dataServiceId,
        );
        await manager.query(
          `INSERT INTO data_hub_data_services (id, service_code, service_type, status, created_by)
           VALUES ($1, $2, $3, 'active', $4)`,
          [dataServiceId, serviceCode, dto.service_type, userId],
        );
        await this.applyTerms(manager, dataServiceId, dto, caller, source, refs);
        const versionId = await insertApprovedVersion(manager, {
          dataServiceId,
          versionNo: 1,
          oldVersion: null,
          userId,
          changelogNote: dto.changelog_note ?? null,
          source,
        });
        await manager.query('UPDATE data_hub_data_services SET active_version_id = $1 WHERE id = $2', [
          versionId,
          dataServiceId,
        ]);
        await insertServiceHistory(manager, {
          dataServiceId,
          versionId,
          versionNo: 1,
          action: DataHubServiceHistoryAction.CREATE,
          changeNote: dto.changelog_note ?? null,
          changes: diffSnapshots(null, buildSnapshot(source, refs)),
          userId,
        });
        return { id: dataServiceId, service_code: serviceCode, version_id: versionId, version_no: 1 };
      });
    } catch (err) {
      rethrowConflict(err, 'SERVICE_CODE_EXISTS: please retry');
    }
  }

  // Every edit is a new approved version; nothing is written when no field changed.
  // Department membership is checked right after the row lock, before any validation or diff, so a caller
  // outside the department always gets 403 (also when moving the service to another department).
  async update(id: number, dto: UpdateDataServiceDto, caller: DataHubCaller): Promise<DataServiceWriteResult> {
    const source = toSource(dto);
    const userId = caller.id;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const pkg = await this.lockService(manager, id);
        await this.access.assertDepartmentWrite(caller, [pkg.department_id, dto.department_id], manager);
        assertSpecMatchesType(pkg.service_type, dto);
        const previous = await this.snapshots.loadVersion(manager, pkg.active_version_id);
        const refs = await this.snapshots.resolveRefs(manager, source, true);
        await this.applyTerms(manager, id, dto, caller, source, refs);
        const changes = diffSnapshots(previous.snapshot, buildSnapshot(source, refs));
        if (changes.length === 0) throw new BadRequestException('NO_CHANGES: nothing to update');

        // Rejected/pending numbers never count; soft-deleted approved rows still do so numbers are not reused.
        const [max]: Array<{ max_no: number }> = await manager.query(
          `SELECT COALESCE(MAX(version_no), 0) AS max_no FROM data_hub_data_service_versions
           WHERE data_service_id = $1 AND state = 'approved'`,
          [id],
        );
        const versionNo = Number(max.max_no) + 1;
        const versionId = await insertApprovedVersion(manager, {
          dataServiceId: id,
          versionNo,
          oldVersion: previous.version_no,
          userId,
          changelogNote: dto.changelog_note ?? null,
          source,
        });
        // The code follows the division/department of the new version (codes in an older format are rebuilt too).
        const serviceCode = buildServiceCode(
          pkg.service_type,
          refs.division?.label ?? '',
          refs.department?.label ?? '',
          id,
        );
        await manager.query(
          `UPDATE data_hub_data_services SET active_version_id = $1, service_code = $2, updated_by = $3,
             updated_at = NOW() WHERE id = $4`,
          [versionId, serviceCode, userId, id],
        );
        await insertServiceHistory(manager, {
          dataServiceId: id,
          versionId,
          versionNo,
          action: DataHubServiceHistoryAction.UPDATE,
          changeNote: dto.changelog_note ?? null,
          changes,
          userId,
        });
        return { id, service_code: serviceCode, version_id: versionId, version_no: versionNo };
      });
    } catch (err) {
      rethrowConflict(err, 'VERSION_CONFLICT: concurrent edit, please retry');
    }
  }

  async setStatus(
    id: number,
    status: DataHubStatus,
    caller: DataHubCaller,
  ): Promise<{ id: number; status: DataHubStatus }> {
    const userId = caller.id;
    return this.dataSource.transaction(async (manager) => {
      const pkg = await this.lockService(manager, id);
      await this.access.assertDepartmentWrite(caller, [pkg.department_id], manager);
      if (pkg.status === status) throw new BadRequestException(`NO_CHANGES: status is already ${status}`);
      await manager.query(
        'UPDATE data_hub_data_services SET status = $1, updated_by = $2, updated_at = NOW() WHERE id = $3',
        [status, userId, id],
      );
      const [version]: Array<{ version_no: number }> = await manager.query(
        'SELECT version_no FROM data_hub_data_service_versions WHERE id = $1',
        [pkg.active_version_id],
      );
      await insertServiceHistory(manager, {
        dataServiceId: id,
        versionId: pkg.active_version_id,
        versionNo: version ? Number(version.version_no) : null,
        action: DataHubServiceHistoryAction.STATUS,
        changeNote: null,
        changes: [singleFieldChange('status', pkg.status, status)],
        userId,
      });
      return { id, status };
    });
  }

  // Writes the service's source tables and terms, then points the new version at the resulting terms. A
  // NO_CHANGES rejection afterwards rolls these writes back with the transaction.
  private async applyTerms(
    manager: EntityManager,
    dataServiceId: number,
    dto: CreateDataServiceDto | UpdateDataServiceDto,
    caller: DataHubCaller,
    source: VersionSource,
    refs: ResolvedRefs,
  ): Promise<void> {
    const userId = caller.id;
    const { termIds, affectedLogicalIds } = await syncSourceTables(manager, {
      dataServiceId,
      departmentId: dto.department_id,
      scopeDepartmentIds: await this.access.sourceTableDepartmentIds(caller, manager),
      userId,
      groups: dto.source_tables ?? [],
    });
    source.physical_term_ids = termIds;
    Object.assign(refs, await this.snapshots.resolveTerms(manager, termIds));
    await this.logicalHistory.recordVersions(manager, affectedLogicalIds, userId);
  }

  // Row lock so concurrent edits / toggles on one package run one after another.
  private async lockService(manager: EntityManager, id: number): Promise<LockedService> {
    const rows: LockedService[] = await manager.query(
      `SELECT s.id, s.service_code, s.service_type, s.status, s.active_version_id, v.department_id
       FROM data_hub_data_services s
       LEFT JOIN data_hub_data_service_versions v ON v.id = s.active_version_id
       WHERE s.id = $1 AND ${liveSql('s')} AND s.active_version_id IS NOT NULL
       FOR UPDATE OF s`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('DATA_SERVICE_NOT_FOUND');
    return {
      ...rows[0],
      id: Number(rows[0].id),
      active_version_id: Number(rows[0].active_version_id),
      department_id: rows[0].department_id === null ? null : Number(rows[0].department_id),
    };
  }
}
