import { DomainService } from '../domain.service';
import { normalizeDomainUrl } from '../domain-url.util';

describe('DomainService.list', () => {
  const make = () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValue([{ id: '1', url: 'https://api-int.vpbank.com.vn', status: 'active', type: 'internal' }]);
    return { query, service: new DomainService({ query } as never) };
  };

  it('defaults to live active domains and returns numeric ids', async () => {
    const { query, service } = make();
    await expect(service.list({})).resolves.toEqual({
      data: [{ id: 1, url: 'https://api-int.vpbank.com.vn', status: 'active', type: 'internal' }],
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('d.deleted_at IS NULL AND d.is_deleted IS NOT TRUE AND d.status = $1');
    expect(params).toEqual(['active']);
  });

  it('filters by type and status', async () => {
    const { query, service } = make();
    await service.list({ type: 'partner', status: 'inactive' } as never);
    expect(query.mock.calls[0][0]).toContain('AND d.type = $2');
    expect(query.mock.calls[0][1]).toEqual(['inactive', 'partner']);
  });
});

describe('normalizeDomainUrl', () => {
  it('folds case, spaces, trailing slashes and a missing scheme', () => {
    expect(normalizeDomainUrl(' API-INT.vpbank.com.vn/ ')).toBe('https://api-int.vpbank.com.vn');
    expect(normalizeDomainUrl('https://api-int.vpbank.com.vn//')).toBe('https://api-int.vpbank.com.vn');
    expect(normalizeDomainUrl('http://x.vn')).toBe('http://x.vn');
    expect(normalizeDomainUrl('  ')).toBe('');
  });
});
