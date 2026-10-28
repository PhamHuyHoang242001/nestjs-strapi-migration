import { ForbiddenException } from '@nestjs/common';
import { DataHubStatsController } from '../data-hub-stats.controller';
import { DataHubStatsService } from '../data-hub-stats.service';

describe('DataHubStatsService', () => {
  const makeService = (row: Record<string, unknown> | undefined) => {
    const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue(row ? [row] : []);
    return { service: new DataHubStatsService({ query } as never), query };
  };

  it('returns active totals for data services, consumers and data terms in one query', async () => {
    const { service, query } = makeService({
      ds_total: 145,
      ds_api: 109,
      ds_sftp: 36,
      c_total: 43,
      c_internal: 27,
      c_partner: 16,
      logical: 22,
      physical: 54,
    });
    await expect(service.stats()).resolves.toEqual({
      data_services: { total: 145, api: 109, sftp: 36 },
      consumers: { total: 43, internal: 27, partner: 16 },
      data_terms: { logical: 22, physical: 54 },
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0];
    // only active + live services (with a live active version) and active + live consumers are counted
    expect(sql).toContain("s.deleted_at IS NULL AND s.is_deleted IS NOT TRUE AND s.status = 'active'");
    expect(sql).toContain('JOIN data_hub_data_service_versions v ON v.id = s.active_version_id');
    expect(sql).toContain("c.deleted_at IS NULL AND c.is_deleted IS NOT TRUE AND c.status = 'active'");
    // logical terms are live-only; physical terms are live and owned by an active live service
    expect(sql).toContain('FROM data_hub_logical_terms lt WHERE lt.deleted_at IS NULL');
    expect(sql).toContain('FROM data_hub_physical_terms pt WHERE pt.deleted_at IS NULL');
    expect(sql).toContain(
      "WHERE os.id = pt.data_service_id AND os.deleted_at IS NULL AND os.is_deleted IS NOT TRUE AND os.status = 'active'",
    );
    expect(sql).toContain('ov.id = os.active_version_id AND ov.deleted_at IS NULL');
    expect(sql).not.toContain('pt.status');
    expect(sql).not.toMatch(/SELECT\s+\*/);
  });

  it('empty result → zeros', async () => {
    const { service } = makeService(undefined);
    await expect(service.stats()).resolves.toEqual({
      data_services: { total: 0, api: 0, sftp: 0 },
      consumers: { total: 0, internal: 0, partner: 0 },
      data_terms: { logical: 0, physical: 0 },
    });
  });

  it('controller rejects an unauthenticated caller', () => {
    const controller = new DataHubStatsController({ stats: jest.fn() } as never);
    expect(() => controller.stats({ info: { user: {} } } as never)).toThrow(ForbiddenException);
  });
});
