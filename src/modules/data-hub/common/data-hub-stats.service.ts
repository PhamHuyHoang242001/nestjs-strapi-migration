import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { activeSql, liveSql } from './data-hub-query.util';
import { termOfActiveServiceSql } from './source-table-groups.util';

export interface DataHubStats {
  data_services: { total: number; api: number; sftp: number };
  consumers: { total: number; internal: number; partner: number };
  data_terms: { logical: number; physical: number };
}

// One KPI source for the catalog, consumers and dictionary tabs.
// Data services: active, live, with a live active version. Consumers: active, live.
// Logical terms have no status (live only); physical terms count when live and owned by an active live service.
@Injectable()
export class DataHubStatsService {
  constructor(private readonly dataSource: DataSource) {}

  async stats(): Promise<DataHubStats> {
    const [row] = await this.dataSource.query<
      Array<{
        ds_total: number;
        ds_api: number;
        ds_sftp: number;
        c_total: number;
        c_internal: number;
        c_partner: number;
        logical: number;
        physical: number;
      }>
    >(
      `SELECT ds.total AS ds_total, ds.api AS ds_api, ds.sftp AS ds_sftp,
              c.total AS c_total, c.internal AS c_internal, c.partner AS c_partner,
              (SELECT COUNT(*)::int FROM data_hub_logical_terms lt WHERE ${liveSql('lt')}) AS logical,
              (SELECT COUNT(*)::int FROM data_hub_physical_terms pt WHERE ${termOfActiveServiceSql('pt')}) AS physical
       FROM (SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE s.service_type = 'API')::int AS api,
                    COUNT(*) FILTER (WHERE s.service_type = 'SFTP')::int AS sftp
             FROM data_hub_data_services s
             JOIN data_hub_data_service_versions v ON v.id = s.active_version_id AND ${liveSql('v')}
             WHERE ${activeSql('s')}) ds,
            (SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE c.category = 'INTERNAL_APP')::int AS internal,
                    COUNT(*) FILTER (WHERE c.category = 'PARTNER_ECOSYSTEM')::int AS partner
             FROM data_hub_consumers c
             WHERE ${activeSql('c')}) c`,
    );
    const n = (v: unknown) => Number(v ?? 0);
    return {
      data_services: { total: n(row?.ds_total), api: n(row?.ds_api), sftp: n(row?.ds_sftp) },
      consumers: { total: n(row?.c_total), internal: n(row?.c_internal), partner: n(row?.c_partner) },
      data_terms: { logical: n(row?.logical), physical: n(row?.physical) },
    };
  }
}
