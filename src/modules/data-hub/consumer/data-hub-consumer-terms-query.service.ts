import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DataHubPageQueryDto, liveSql } from '../common/data-hub-query.util';
import { listGroupTerms, listSourceTableGroupsWithTerms, TermScope } from '../common/source-table-groups.util';
import { ACTIVE_LINK_FROM } from './consumer-list-filter.util';

// Terms a consumer receives: those on the active version of every active live service serving it.
const consumerScope = (consumerId: number): TermScope => ({
  sql: `p.id IN (SELECT vpt.physical_term_id FROM ${ACTIVE_LINK_FROM}
                 JOIN data_hub_data_service_version_physical_terms vpt
                   ON vpt.data_service_version_id = ds.active_version_id
                 WHERE l.consumer_id = $1)`,
  params: [consumerId],
});

// "Từ điển dữ liệu" tab of a consumer: grouped by source table with terms nested; each term says which service
// provides it.
@Injectable()
export class DataHubConsumerTermsQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async sourceTables(id: number, q: DataHubPageQueryDto) {
    await this.assertLive(id);
    return listSourceTableGroupsWithTerms(this.dataSource, consumerScope(id), q);
  }

  async sourceTableTerms(id: number, sourceTableId: number) {
    await this.assertLive(id);
    return { data: await listGroupTerms(this.dataSource, consumerScope(id), sourceTableId) };
  }

  private async assertLive(id: number): Promise<void> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM data_hub_consumers c WHERE c.id = $1 AND ${liveSql('c')}`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('CONSUMER_NOT_FOUND');
  }
}
