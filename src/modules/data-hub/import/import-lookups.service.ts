import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubAccessService, DataHubCaller } from '../common/data-hub-access.service';
import { liveSql } from '../common/data-hub-query.util';
import { DetailSourceTable, loadVersionSourceTables } from '../data-service/data-service-source-tables-detail.util';
import { codeMap, ConsumerRef, consumerMap, lower, uniqueLower, userMap } from './import-helpers.util';
import { ImportRow, splitList } from './import-workbook.util';

// Everything a service upload refers to by code or email, looked up once per upload. Keys are lower case.
export interface ImportReferences {
  requestUnits: Map<string, number>;
  divisions: Map<string, number>;
  departments: Map<string, number>;
  // Live consumers; `active` = may be picked on a service.
  consumers: Map<string, ConsumerRef>;
  // Live users; an email shared by several live users maps to null (cannot tell which one is meant).
  users: Map<string, number | null>;
  // Departments the caller may create services in; null = every department (super_admin).
  writableDepartmentIds: Set<number> | null;
}

@Injectable()
export class DataServiceImportReferenceLookupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: DataHubAccessService,
  ) {}

  async load(rows: ImportRow[], caller: DataHubCaller): Promise<ImportReferences> {
    const pick = (key: string) => uniqueLower(rows.map((r) => r.values[key]));
    const many = (keys: string[]) => uniqueLower(rows.flatMap((r) => keys.flatMap((k) => splitList(r.values[k]))));
    const [requestUnits, divisions, departments, consumers, users, writable] = await Promise.all([
      codeMap(this.dataSource, 'data_hub_request_units', pick('request_unit')),
      codeMap(this.dataSource, 'data_hub_divisions', pick('division')),
      codeMap(this.dataSource, 'data_hub_departments', pick('department')),
      consumerMap(this.dataSource, many(['consumers'])),
      userMap(this.dataSource, many(['requesters', 'it_supporters', 'service_owners'])),
      this.access.writableDepartmentIds(caller, 'create'),
    ]);
    return {
      requestUnits,
      divisions,
      departments,
      consumers,
      users,
      writableDepartmentIds: writable === null ? null : new Set(writable),
    };
  }
}

export interface SourceTableService {
  id: number;
  code: string;
  activeVersionId: number;
  departmentId: number | null;
  // Tables and terms of the active version.
  tables: DetailSourceTable[];
}

// Everything the upload refers to, looked up once per upload. Keys are lower case.
@Injectable()
export class SourceTableImportLookupService {
  constructor(private readonly dataSource: DataSource) {}

  logicals(codes: string[]): Promise<Map<string, number>> {
    return codeMap(this.dataSource, 'data_hub_logical_terms', codes);
  }

  // Live services with an active version, each with the tables of that version.
  async services(codes: string[]): Promise<Map<string, SourceTableService>> {
    if (codes.length === 0) return new Map();
    const rows: Array<{ id: number; service_code: string; active_version_id: number; department_id: number | null }> =
      await this.dataSource.query(
        `SELECT s.id, s.service_code, s.active_version_id, v.department_id
         FROM data_hub_data_services s
         JOIN data_hub_data_service_versions v ON v.id = s.active_version_id
         WHERE LOWER(s.service_code) = ANY($1) AND ${liveSql('s')}`,
        [codes.map(lower)],
      );
    const out = new Map<string, SourceTableService>();
    for (const r of rows) {
      out.set(lower(r.service_code), {
        id: Number(r.id),
        code: r.service_code,
        activeVersionId: Number(r.active_version_id),
        departmentId: r.department_id === null ? null : Number(r.department_id),
        tables: await loadVersionSourceTables(this.dataSource, Number(r.active_version_id)),
      });
    }
    return out;
  }

  // Lower-case names of live source tables among the given ones (a new table may not take one).
  async tableNames(names: string[]): Promise<Set<string>> {
    if (names.length === 0) return new Set();
    const rows: Array<{ name: string }> = await this.dataSource.query(
      `SELECT st.name FROM data_hub_source_tables st WHERE LOWER(st.name) = ANY($1) AND ${liveSql('st')}`,
      [names.map(lower)],
    );
    return new Set(rows.map((r) => lower(r.name)));
  }
}
