import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { activeSql, liveSql } from '../common/data-hub-query.util';

interface DetailRow {
  id: number;
  code: string;
  technical_description: string;
  example_value: string | null;
  logical_id: number | null;
  logical_code: string | null;
  logical_short_description: string | null;
  st_id: number;
  st_name: string;
  st_description: string | null;
  ds_id: number;
  service_code: string;
  service_type: string;
  service_status: string;
  service_name: string | null;
  created_by: number;
  updated_by: number | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PhysicalTermDetailService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  // Read-only: a physical term is created, edited and deleted from its data service's form.
  async getById(id: number) {
    const rows: DetailRow[] = await this.dataSource.query(
      `SELECT p.id, p.code, p.technical_description, p.example_value,
              lt.id AS logical_id, lt.code AS logical_code, lt.short_description AS logical_short_description,
              st.id AS st_id, st.name AS st_name, st.description AS st_description,
              s.id AS ds_id, s.service_code, s.service_type, s.status AS service_status, v.name AS service_name,
              p.created_by, p.updated_by, p.created_at, p.updated_at
       FROM data_hub_physical_terms p
       JOIN data_hub_source_tables st ON st.id = p.source_table_id
       JOIN data_hub_data_services s ON s.id = p.data_service_id AND ${liveSql('s')}
       LEFT JOIN data_hub_data_service_versions v ON v.id = s.active_version_id
       LEFT JOIN data_hub_logical_terms lt ON lt.id = p.logical_term_id AND ${liveSql('lt')}
       WHERE p.id = $1 AND ${liveSql('p')}`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('PHYSICAL_TERM_NOT_FOUND');
    const r = rows[0];
    // Systems out = active live consumers of the owning service's active version (when the service is active).
    const systems: Array<{ id: number; code: string; name: string }> = await this.dataSource.query(
      `SELECT DISTINCT c.id, c.code, c.name
       FROM data_hub_data_services ds
       JOIN data_hub_data_service_version_physical_terms vpt ON vpt.data_service_version_id = ds.active_version_id
       JOIN data_hub_data_service_version_consumers vc ON vc.data_service_version_id = ds.active_version_id
       JOIN data_hub_consumers c ON c.id = vc.consumer_id AND ${activeSql('c')}
       WHERE vpt.physical_term_id = $1 AND ${activeSql('ds')}
       ORDER BY c.code, c.id`,
      [id],
    );
    const users = await this.userRefs.resolve([r.created_by, r.updated_by]);
    return {
      id: Number(r.id),
      code: r.code,
      technical_description: r.technical_description,
      example_value: r.example_value,
      logical_term:
        r.logical_id === null
          ? null
          : { id: Number(r.logical_id), code: r.logical_code, short_description: r.logical_short_description },
      source_table: { id: Number(r.st_id), name: r.st_name, description: r.st_description },
      data_service: {
        id: Number(r.ds_id),
        service_code: r.service_code,
        service_type: r.service_type,
        status: r.service_status,
        name: r.service_name ?? '',
      },
      systems_out: systems.map((c) => ({ id: Number(c.id), code: c.code, name: c.name })),
      created_by_user: this.userRefs.toRef(users, r.created_by),
      updated_by_user: this.userRefs.toRef(users, r.updated_by),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }
}
