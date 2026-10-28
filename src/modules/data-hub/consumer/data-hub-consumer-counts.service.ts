import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { liveSql } from '../common/data-hub-query.util';
import { ACTIVE_LINK_FROM } from './consumer-list-filter.util';
import { sqlRows } from './consumer-sql.util';

@Injectable()
export class DataHubConsumerCountsService {
  constructor(private readonly dataSource: DataSource) {}

  // api/sftp service counts per consumer, one grouped query for a whole page.
  async loadServiceCounts(ids: number[]): Promise<Map<number, { api: number; sftp: number }>> {
    const out = new Map<number, { api: number; sftp: number }>();
    if (ids.length === 0) return out;
    const rows = await sqlRows<{ consumer_id: number; service_type: string; cnt: number }>(
      this.dataSource,
      `SELECT l.consumer_id, ds.service_type, COUNT(DISTINCT ds.id)::int AS cnt
       FROM ${ACTIVE_LINK_FROM}
       WHERE l.consumer_id = ANY($1)
       GROUP BY l.consumer_id, ds.service_type`,
      [ids],
    );
    for (const r of rows) {
      const entry = out.get(Number(r.consumer_id)) ?? { api: 0, sftp: 0 };
      if (r.service_type === 'API') entry.api = r.cnt;
      else if (r.service_type === 'SFTP') entry.sftp = r.cnt;
      out.set(Number(r.consumer_id), entry);
    }
    return out;
  }

  // Distinct physical terms reachable through each consumer's active services.
  async loadTermCounts(ids: number[]): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    if (ids.length === 0) return out;
    const rows = await sqlRows<{ consumer_id: number; cnt: number }>(
      this.dataSource,
      `SELECT l.consumer_id, COUNT(DISTINCT vpt.physical_term_id)::int AS cnt
       FROM ${ACTIVE_LINK_FROM}
       JOIN data_hub_data_service_version_physical_terms vpt ON vpt.data_service_version_id = ds.active_version_id
       JOIN data_hub_physical_terms pt ON pt.id = vpt.physical_term_id AND ${liveSql('pt')}
       WHERE l.consumer_id = ANY($1)
       GROUP BY l.consumer_id`,
      [ids],
    );
    for (const r of rows) out.set(Number(r.consumer_id), r.cnt);
    return out;
  }
}
