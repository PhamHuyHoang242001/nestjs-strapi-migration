import { DataHubConsumerCountsService } from '../data-hub-consumer-counts.service';

describe('DataHubConsumerCountsService.loadTermCounts', () => {
  it('counts only live physical terms and maps rows by consumer', async () => {
    const query = jest.fn<Promise<unknown>, [string, unknown[]]>().mockResolvedValue([{ consumer_id: 4, cnt: 3 }]);
    const counts = await new DataHubConsumerCountsService({ query } as never).loadTermCounts([4, 5]);
    expect(counts.get(4)).toBe(3);
    expect(counts.has(5)).toBe(false);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('pt.deleted_at IS NULL');
    expect(sql).not.toContain('pt.status');
    expect(sql).toContain('pt.deleted_at IS NULL');
  });

  it('skips the query for an empty page', async () => {
    const query = jest.fn();
    await new DataHubConsumerCountsService({ query } as never).loadTermCounts([]);
    expect(query).not.toHaveBeenCalled();
  });
});
