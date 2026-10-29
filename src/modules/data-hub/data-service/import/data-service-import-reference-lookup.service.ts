import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubAccessService, DataHubCaller } from '../../common/data-hub-access.service';
import { DH_PERMISSIONS } from '../../common/data-hub-permission-codes';
import { liveSql } from '../../common/data-hub-query.util';
import { ImportSheetRows, splitList } from './data-service-import-workbook-reader.util';

// Everything the upload refers to by code, email or name, looked up once per upload. Keys are lower case.
export interface ImportReferences {
  requestUnits: Map<string, number>;
  divisions: Map<string, number>;
  departments: Map<string, number>;
  // Live consumers; `active` = may be picked on a service.
  consumers: Map<string, { id: number; active: boolean }>;
  // Live users; an email shared by several live users maps to null (cannot tell which one is meant).
  users: Map<string, number | null>;
  // Live logical terms.
  logicalTerms: Map<string, number>;
  // Names of live source tables (a new table may not take one).
  sourceTableNames: Set<string>;
  // Departments the caller may create services in; null = every department (super_admin).
  writableDepartmentIds: Set<number> | null;
  canCreateLogical: boolean;
}

export const lower = (s: string): string => s.toLowerCase();

const SERVICE_SHEETS = ['API', 'SFTP'] as const;

@Injectable()
export class DataServiceImportReferenceLookupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: DataHubAccessService,
  ) {}

  async load(sheets: ImportSheetRows, caller: DataHubCaller): Promise<ImportReferences> {
    const serviceRows = SERVICE_SHEETS.flatMap((s) => sheets[s]);
    const pick = (key: string) => [...new Set(serviceRows.map((r) => lower(r.values[key])).filter(Boolean))];
    const many = (keys: string[]) => [
      ...new Set(serviceRows.flatMap((r) => keys.flatMap((k) => splitList(r.values[k]).map(lower)))),
    ];
    const logicalCodes = [
      ...new Set(
        [...sheets.TERMS.map((r) => r.values.logical_code), ...sheets.LOGICAL.map((r) => r.values.code)]
          .filter(Boolean)
          .map(lower),
      ),
    ];
    const tableNames = [...new Set(sheets.TERMS.map((r) => lower(r.values.table_name)).filter(Boolean))];

    const [requestUnits, divisions, departments, consumers, users, logicalTerms, tables, writable, canLogical] =
      await Promise.all([
        this.codeMap('data_hub_request_units', pick('request_unit')),
        this.codeMap('data_hub_divisions', pick('division')),
        this.codeMap('data_hub_departments', pick('department')),
        this.consumerMap(many(['consumers'])),
        this.userMap(many(['requesters', 'it_supporters', 'service_owners'])),
        this.codeMap('data_hub_logical_terms', logicalCodes),
        this.existingTableNames(tableNames),
        this.access.writableDepartmentIds(caller, 'create'),
        this.access.hasCode(caller, DH_PERMISSIONS.LOGICAL_TERM_CREATE),
      ]);
    return {
      requestUnits,
      divisions,
      departments,
      consumers,
      users,
      logicalTerms,
      sourceTableNames: tables,
      writableDepartmentIds: writable === null ? null : new Set(writable),
      canCreateLogical: canLogical,
    };
  }

  // Live rows of a table with a `code` column, matched case-insensitively.
  private async codeMap(table: string, codes: string[]): Promise<Map<string, number>> {
    if (codes.length === 0) return new Map();
    const rows: Array<{ id: number; code: string }> = await this.dataSource.query(
      `SELECT t.id, t.code FROM ${table} t WHERE LOWER(t.code) = ANY($1) AND ${liveSql('t')} ORDER BY t.id`,
      [codes],
    );
    const out = new Map<string, number>();
    rows.forEach((r) => out.has(lower(r.code)) || out.set(lower(r.code), Number(r.id)));
    return out;
  }

  private async consumerMap(codes: string[]): Promise<Map<string, { id: number; active: boolean }>> {
    if (codes.length === 0) return new Map();
    const rows: Array<{ id: number; code: string; status: string }> = await this.dataSource.query(
      `SELECT c.id, c.code, c.status FROM data_hub_consumers c WHERE LOWER(c.code) = ANY($1) AND ${liveSql('c')}`,
      [codes],
    );
    return new Map(rows.map((r) => [lower(r.code), { id: Number(r.id), active: r.status === 'active' }]));
  }

  // Only id + email are read from users.
  private async userMap(emails: string[]): Promise<Map<string, number | null>> {
    if (emails.length === 0) return new Map();
    const rows: Array<{ id: number; email: string }> = await this.dataSource.query(
      `SELECT u.id, u.email FROM users u
       WHERE LOWER(u.email) = ANY($1) AND u.deleted_at IS NULL AND COALESCE(u.is_deleted, false) = false`,
      [emails],
    );
    const out = new Map<string, number | null>();
    rows.forEach((r) => {
      const key = lower(r.email);
      out.set(key, out.has(key) ? null : Number(r.id));
    });
    return out;
  }

  private async existingTableNames(names: string[]): Promise<Set<string>> {
    if (names.length === 0) return new Set();
    const rows: Array<{ name: string }> = await this.dataSource.query(
      `SELECT st.name FROM data_hub_source_tables st WHERE LOWER(st.name) = ANY($1) AND ${liveSql('st')}`,
      [names],
    );
    return new Set(rows.map((r) => lower(r.name)));
  }
}
