import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubPageQueryDto, liveSql } from '../common/data-hub-query.util';
import {
  GroupedTerm,
  listGroupTerms,
  listSourceTableGroupsWithTerms,
  serviceVersionScope,
} from '../common/source-table-groups.util';
import { queryRows } from './data-service-query-rows.util';

// "Từ điển dữ liệu" tab of a service: its active version's terms grouped by source table (paged groups, terms
// nested), and the terms of one group. Every term belongs to this service, so the owning-service field is left out.
const ownTerm = (t: GroupedTerm): Omit<GroupedTerm, 'data_service'> => ({
  id: t.id,
  code: t.code,
  technical_description: t.technical_description,
  example_value: t.example_value,
  logical_term: t.logical_term,
});

@Injectable()
export class DataHubDataServiceTermsQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async sourceTables(id: number, q: DataHubPageQueryDto) {
    const scope = serviceVersionScope(await this.activeVersionId(id));
    const res = await listSourceTableGroupsWithTerms(this.dataSource, scope, q);
    return { ...res, data: res.data.map((g) => ({ ...g, physical_terms: g.physical_terms.map(ownTerm) })) };
  }

  async sourceTableTerms(
    id: number,
    sourceTableId: number,
  ): Promise<{ data: Array<Omit<GroupedTerm, 'data_service'>> }> {
    const scope = serviceVersionScope(await this.activeVersionId(id));
    return { data: (await listGroupTerms(this.dataSource, scope, sourceTableId)).map(ownTerm) };
  }

  private async activeVersionId(id: number): Promise<number> {
    const [pkg] = await queryRows<{ active_version_id: number }>(
      this.dataSource,
      `SELECT s.active_version_id FROM data_hub_data_services s
       WHERE s.id = $1 AND ${liveSql('s')} AND s.active_version_id IS NOT NULL`,
      [id],
    );
    if (!pkg) throw new NotFoundException('DATA_SERVICE_NOT_FOUND');
    return Number(pkg.active_version_id);
  }
}
