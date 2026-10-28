import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataHubConsumerController } from '../data-hub-consumer.controller';
import { DataHubConsumerCountsService } from '../data-hub-consumer-counts.service';
import { DataHubConsumerExportService } from '../data-hub-consumer-export.service';
import { DataHubConsumerQueryService } from '../data-hub-consumer-query.service';
import { DataHubUserRefService } from '../../common/data-hub-user-ref.service';

const listRow = {
  id: 1,
  code: 'CRM',
  name: 'CRM',
  category: 'INTERNAL_APP',
  short_description: 'd',
  avatar_url: '/uploads/crm.png',
  status: 'active',
  division_id: 1,
  division_code: 'DIV',
  division_name: 'Div',
};

function makeQueryService(handler: (sql: string, params?: unknown[]) => unknown[]) {
  const query = jest.fn((sql: string, params?: unknown[]) => Promise.resolve(handler(sql, params)));
  const ds = { query, manager: { query } };
  const userRefs = new DataHubUserRefService(ds as never);
  const counts = new DataHubConsumerCountsService(ds as never);
  return { service: new DataHubConsumerQueryService(ds as never, userRefs, counts), query };
}

describe('DataHubConsumerQueryService', () => {
  it('list: explicit columns, bound params, derived counts and {id,email} user refs', async () => {
    const { service, query } = makeQueryService((sql) => {
      if (sql.includes('COUNT(*)::int AS total')) return [{ total: 1 }];
      if (sql.includes('GROUP BY l.consumer_id, ds.service_type'))
        return [
          { consumer_id: 1, service_type: 'API', cnt: 2 },
          { consumer_id: 1, service_type: 'SFTP', cnt: 1 },
        ];
      if (sql.includes('FROM data_hub_consumer_so_apps'))
        return [
          { consumer_id: 1, user_id: 7 },
          { consumer_id: 1, user_id: 8 },
        ];
      if (sql.includes('FROM users'))
        return [
          { id: 7, email: 'so@x.vn' },
          { id: 8, email: 'so2@x.vn' },
        ];
      return [listRow];
    });
    const res = await service.list({ page: 1, limit: 10, connection_type: 'API', logical_term_ids: [3] });

    expect(res.meta).toEqual({ total: 1, page: 1, limit: 10 });
    expect(res.data[0]).toEqual({
      id: 1,
      code: 'CRM',
      name: 'CRM',
      category: 'INTERNAL_APP',
      short_description: 'd',
      avatar_url: '/uploads/crm.png',
      status: 'active',
      division: { id: 1, code: 'DIV', name: 'Div' },
      so_apps: [
        { id: 7, email: 'so@x.vn' },
        { id: 8, email: 'so2@x.vn' },
      ],
      api_count: 2,
      sftp_count: 1,
    });
    for (const [sql] of query.mock.calls) expect(sql).not.toMatch(/\*(?!\))|\bSELECT\s+\*/);
    // newest first by default
    const listCall = query.mock.calls.find(([sql]) => sql.includes('ORDER BY c.created_at DESC, c.id DESC'));
    expect(listCall?.[1]).toEqual(['active', 'API', [3], 10, 0]);
    // counts and users are batched once for the whole page
    expect(query.mock.calls.filter(([sql]) => sql.includes('GROUP BY l.consumer_id'))).toHaveLength(1);
    expect(query.mock.calls.filter(([sql]) => sql.includes('FROM users'))).toHaveLength(1);
    expect(query.mock.calls.filter(([sql]) => sql.includes('FROM data_hub_consumer_so_apps'))).toHaveLength(1);
  });

  it('list: consumer without active links gets zero counts', async () => {
    const { service } = makeQueryService((sql) => {
      if (sql.includes('COUNT(*)::int AS total')) return [{ total: 1 }];
      if (sql.includes('FROM data_hub_consumer_so_apps')) return [{ consumer_id: 1, user_id: 7 }];
      if (sql.includes('FROM users')) return [];
      if (sql.includes('GROUP BY')) return [];
      return [listRow];
    });
    const res = await service.list({});
    expect(res.data[0]).toMatchObject({ api_count: 0, sftp_count: 0, so_apps: [{ id: 7, email: null }] });
  });

  it('detail: adds term_count, version_no and all user refs; 404 when missing', async () => {
    const detailRow = {
      ...listRow,
      version_no: 2,
      created_by: 7,
      updated_by: 8,
      created_at: 'c',
      updated_at: 'u',
    };
    const { service } = makeQueryService((sql) => {
      if (sql.includes('c.created_by')) return [detailRow];
      if (sql.includes('COUNT(DISTINCT vpt.physical_term_id)')) return [{ consumer_id: 1, cnt: 4 }];
      if (sql.includes('GROUP BY')) return [];
      if (sql.includes('FROM users'))
        return [
          { id: 7, email: 'a@x' },
          { id: 8, email: 'b@x' },
        ];
      return [];
    });
    const res = await service.detail(1);
    expect(res).toMatchObject({
      term_count: 4,
      version_no: 2,
      created_by_user: { id: 7, email: 'a@x' },
      updated_by_user: { id: 8, email: 'b@x' },
    });
    expect(res).not.toHaveProperty('tech_user');
    expect(res).not.toHaveProperty('biz_user');

    const missing = makeQueryService(() => []);
    await expect(missing.service.detail(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('histories: newest first with changed_by_user refs', async () => {
    const { service, query } = makeQueryService((sql) => {
      if (sql.includes('SELECT 1 AS ok')) return [{ ok: 1 }];
      if (sql.includes('COUNT(*)')) return [{ total: 1 }];
      if (sql.includes('FROM users')) return [{ id: 5, email: 'e@x' }];
      return [{ id: 1, version_no: 2, action: 'UPDATE', snapshot: { a: 1 }, changed_by: 5, created_at: 't' }];
    });
    const res = await service.histories(1, {} as never);
    expect(res.data[0]).toEqual({
      id: 1,
      version_no: 2,
      action: 'UPDATE',
      snapshot: { a: 1 },
      changed_by_user: { id: 5, email: 'e@x' },
      created_at: 't',
    });
    expect(query.mock.calls.some(([sql]) => sql.includes('ORDER BY h.version_no DESC'))).toBe(true);
  });
});

describe('DataHubConsumerController', () => {
  const svc = {
    list: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    stats: jest.fn(),
    detail: jest.fn(),
    histories: jest.fn(),
  };
  const write = { create: jest.fn().mockResolvedValue({ id: 1 }), update: jest.fn(), updateStatus: jest.fn() };
  const controller = new DataHubConsumerController(
    svc as unknown as DataHubConsumerQueryService,
    write as never,
    { export: jest.fn() } as unknown as DataHubConsumerExportService,
    { hasCode: jest.fn().mockResolvedValue(false) } as never,
    { sourceTables: jest.fn(), sourceTableTerms: jest.fn() } as never,
  );

  it('rejects requests without an authenticated user', () => {
    expect(() => controller.list({} as never, { info: {} } as never)).toThrow(
      new ForbiddenException('User not authenticated'),
    );
    expect(() => controller.create({} as never, { info: {} } as never)).toThrow(ForbiddenException);
  });

  it('detail carries is_update from the consumer update code', async () => {
    svc.detail.mockResolvedValue({ id: 4 });
    await expect(controller.detail(4, { info: { user: { id: 3 }, client: 'user' } } as never)).resolves.toEqual({
      id: 4,
      is_update: false,
    });
  });

  it('passes the caller id to writes', async () => {
    await controller.create({ code: 'A' } as never, { info: { user: { id: 3 } } } as never);
    expect(write.create).toHaveBeenCalledWith({ code: 'A' }, 3);
  });

  it('declares static routes before :id', () => {
    const names = Object.getOwnPropertyNames(DataHubConsumerController.prototype);
    expect(names.indexOf('export')).toBeLessThan(names.indexOf('detail'));
  });
});
