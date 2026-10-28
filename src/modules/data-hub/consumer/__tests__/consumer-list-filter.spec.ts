import { ACTIVE_LINK_FROM, buildConsumerWhere } from '../consumer-list-filter.util';

describe('buildConsumerWhere', () => {
  it('defaults to live + active, no filters', () => {
    const { where, params } = buildConsumerWhere({});
    expect(where).toContain('c.deleted_at IS NULL');
    expect(where).toContain('c.status = $1');
    expect(params).toEqual(['active']);
  });

  it('status=all drops the status predicate', () => {
    const { where, params } = buildConsumerWhere({ status: 'all' });
    expect(where).not.toContain('c.status');
    expect(params).toEqual([]);
  });

  it('binds every user value and escapes LIKE wildcards in search', () => {
    const { where, params } = buildConsumerWhere({
      keyword: '50%_off',
      category: 'INTERNAL_APP',
      division_ids: [1, 2],
    });
    expect(params).toEqual(['active', 'INTERNAL_APP', [1, 2], '%50\\%\\_off%']);
    expect(where).not.toContain('50%');
    expect(where).toContain('ILIKE $4');
  });

  it('connection_type requires an active-version link of that service type', () => {
    const { where, params } = buildConsumerWhere({ connection_type: 'SFTP' });
    expect(where).toContain('EXISTS');
    expect(where).toContain('ds.service_type = $2');
    expect(where).toContain("ds.status = 'active'");
    expect(params).toEqual(['active', 'SFTP']);
    expect(ACTIVE_LINK_FROM).toContain('ds.active_version_id = l.data_service_version_id');
  });

  it('logical_term_ids goes through version physical terms to physical.logical_term_id', () => {
    const { where, params } = buildConsumerWhere({ logical_term_ids: [5, 6] });
    expect(where).toContain('data_hub_data_service_version_physical_terms');
    expect(where).toContain('pt.logical_term_id = ANY($2)');
    // inactive physical terms do not link a consumer to a logical term
    expect(where).toContain('pt.deleted_at IS NULL');
    expect(where).not.toContain('pt.status');
    expect(params).toEqual(['active', [5, 6]]);
  });
});
