import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { liveSql } from './data-hub-query.util';

export interface DataHubOrgRef {
  id: number;
  code: string;
  name: string;
}

// Org lists used by every Data Hub form (selects / filters). Small and unpaged; live rows only.
@Injectable()
export class DataHubOrgService {
  constructor(private readonly dataSource: DataSource) {}

  listDivisions(): Promise<{ data: DataHubOrgRef[] }> {
    return this.list<DataHubOrgRef>('data_hub_divisions', 't.id, t.code, t.name');
  }

  listDepartments(): Promise<{ data: DataHubOrgRef[] }> {
    return this.list<DataHubOrgRef>('data_hub_departments', 't.id, t.code, t.name');
  }

  listRequestUnits(): Promise<{ data: Array<DataHubOrgRef & { category: string | null }> }> {
    return this.list('data_hub_request_units', 't.id, t.code, t.name, t.category');
  }

  private async list<T extends { id: number }>(table: string, columns: string): Promise<{ data: T[] }> {
    const rows: T[] = await this.dataSource.query(
      `SELECT ${columns} FROM ${table} t WHERE ${liveSql('t')} ORDER BY t.code, t.id`,
    );
    return { data: rows.map((r) => ({ ...r, id: Number(r.id) })) };
  }
}
