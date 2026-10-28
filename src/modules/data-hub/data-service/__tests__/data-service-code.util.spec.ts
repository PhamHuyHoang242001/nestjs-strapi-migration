import { DataHubServiceType } from '@modules/databases/data-hub-enums';
import { buildServiceCodePrefix, formatServiceCode, nextServiceCode } from '../data-service-code.util';

describe('service code', () => {
  it('builds API and SFT prefixes from the division code', () => {
    expect(buildServiceCodePrefix(DataHubServiceType.API, 'FIN')).toBe('API-FIN-');
    expect(buildServiceCodePrefix(DataHubServiceType.SFTP, 'FIN')).toBe('SFT-FIN-');
  });

  it('zero-pads to 3 digits and grows past 999', () => {
    expect(formatServiceCode('API-FIN-', 1)).toBe('API-FIN-001');
    expect(formatServiceCode('API-FIN-', 42)).toBe('API-FIN-042');
    expect(formatServiceCode('API-FIN-', 1000)).toBe('API-FIN-1000');
  });

  const managerWith = (maxNo: number | string | undefined) => {
    const query = jest
      .fn<Promise<unknown>, [string, unknown[]?]>()
      .mockResolvedValueOnce([{ pg_advisory_xact_lock: '' }])
      .mockResolvedValueOnce(maxNo === undefined ? [] : [{ max_no: maxNo }]);
    return { manager: { query } as never, query };
  };

  it('takes the advisory lock first, then continues after the highest suffix', async () => {
    const { manager, query } = managerWith('7');
    await expect(nextServiceCode(manager, 'API-FIN-')).resolves.toBe('API-FIN-008');
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock(hashtext($1))');
    expect(query.mock.calls[0][1]).toEqual(['API-FIN-']);
  });

  it('counts soft-deleted rows (no live filter) and only digit suffixes of the exact prefix', async () => {
    const { manager, query } = managerWith(3);
    await nextServiceCode(manager, 'API-FIN-');
    const sql = query.mock.calls[1][0];
    expect(sql).not.toContain('deleted_at');
    expect(sql).toContain("~ '^[0-9]+$'");
    expect(query.mock.calls[1][1]).toEqual(['API-FIN-']);
  });

  it('starts at 001 for an unused prefix', async () => {
    const { manager } = managerWith(0);
    await expect(nextServiceCode(manager, 'SFT-OPS-')).resolves.toBe('SFT-OPS-001');
    const { manager: empty } = managerWith(undefined);
    await expect(nextServiceCode(empty, 'SFT-OPS-')).resolves.toBe('SFT-OPS-001');
  });
});
