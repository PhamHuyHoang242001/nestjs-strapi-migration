import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainStatus } from '@modules/databases/integration-domain-config.entity';
import { ListDomainQueryDto } from './dto/list-domain-query.dto';

export interface DomainRow {
  id: number;
  url: string;
  status: string;
  type: string;
}

@Injectable()
export class DomainService {
  constructor(private readonly dataSource: DataSource) {}

  async list(q: ListDomainQueryDto): Promise<{ data: DomainRow[] }> {
    const params: unknown[] = [q.status ?? DomainStatus.ACTIVE];
    let where = `d.deleted_at IS NULL AND d.is_deleted IS NOT TRUE AND d.status = $1`;
    if (q.type) {
      params.push(q.type);
      where += ` AND d.type = $2`;
    }
    const rows: DomainRow[] = await this.dataSource.query(
      `SELECT d.id, d.url, d.status, d.type FROM integration_domain_configs d WHERE ${where} ORDER BY d.url, d.id`,
      params,
    );
    return { data: rows.map((r) => ({ ...r, id: Number(r.id) })) };
  }
}
