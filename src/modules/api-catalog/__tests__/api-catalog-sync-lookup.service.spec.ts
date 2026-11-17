import { ApiCatalogSyncLookupService } from '../api-catalog-sync-lookup.service';

function setup(rows: unknown[], total = rows.length) {
  const ds: any = {
    query: jest.fn(async (sql: string) => (sql.includes('COUNT(*)') ? [{ total: String(total) }] : rows)),
  };
  return { service: new ApiCatalogSyncLookupService(ds), ds };
}

describe('ApiCatalogSyncLookupService', () => {
  it('lists active api-catalog category names', async () => {
    const { service, ds } = setup([{ name: 'API Demo' }]);
    expect(await service.categories()).toEqual({ data: [{ name: 'API Demo' }] });
    expect(ds.query.mock.calls[0][0]).toContain('is_active = true');
    expect(ds.query.mock.calls[0][1]).toEqual(['api-catalog']);
  });

  it('lists publisher names', async () => {
    const { service } = setup([{ name: 'Khác' }]);
    expect(await service.publishers()).toEqual({ data: [{ name: 'Khác' }] });
  });

  it('lists coworker codes with their active-version name', async () => {
    const { service, ds } = setup([{ code: 'cw_1', name: 'Coworker 1' }]);
    expect(await service.coworkers()).toEqual({ data: [{ code: 'cw_1', name: 'Coworker 1' }] });
    expect(ds.query.mock.calls[0][0]).toContain('LEFT JOIN coworker_versions');
  });

  it('paginates users and binds a lower-cased search', async () => {
    const { service, ds } = setup([{ email: 'a@corp.vn', full_name: 'A' }], 121);
    const res = await service.users({ search: ' Nguyen ', page: 3, limit: 50 });

    expect(ds.query.mock.calls[0][1]).toEqual(['%nguyen%', 50, 100]);
    expect(ds.query.mock.calls[1][1]).toEqual(['%nguyen%']);
    // Only active, non-deleted users are listed.
    expect(ds.query.mock.calls[0][0]).toContain("status = 'active'");
    expect(ds.query.mock.calls[0][0]).toContain('COALESCE(blocked, false) = false');
    expect(res.meta).toMatchObject({ currentPage: 3, itemsPerPage: 50, totalItems: 121, totalPages: 3 });
  });

  it('passes a null search when none is given', async () => {
    const { service, ds } = setup([]);
    await service.users({});
    expect(ds.query.mock.calls[0][1]).toEqual([null, 50, 0]);
  });
});
