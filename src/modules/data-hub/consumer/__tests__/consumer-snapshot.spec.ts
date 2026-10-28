import { buildConsumerSnapshot, snapshotsEqual } from '../consumer-snapshot.util';

const base = {
  code: 'CRM',
  name: 'CRM',
  category: 'INTERNAL_APP',
  division_id: '1',
  short_description: 'd',
  avatar_url: null,
  status: 'active',
  so_app_user_ids: [1],
};

describe('consumer snapshot', () => {
  it('has exactly the contract keys in order (SO APP ids only), ids as numbers', () => {
    const s = buildConsumerSnapshot(base);
    expect(Object.keys(s)).toEqual([
      'code',
      'name',
      'category',
      'division_id',
      'short_description',
      'avatar_url',
      'status',
      'so_app_user_ids',
    ]);
    expect(s.division_id).toBe(1);
    expect(s.avatar_url).toBeNull();
  });

  it('detects equality and differences', () => {
    expect(snapshotsEqual(buildConsumerSnapshot(base), buildConsumerSnapshot({ ...base, division_id: 1 }))).toBe(true);
    expect(snapshotsEqual(buildConsumerSnapshot(base), buildConsumerSnapshot({ ...base, name: 'x' }))).toBe(false);
  });

  it('treats an empty or missing avatar as none, and a new avatar as a change', () => {
    const none = buildConsumerSnapshot(base);
    expect(snapshotsEqual(none, buildConsumerSnapshot({ ...base, avatar_url: '' }))).toBe(true);
    expect(snapshotsEqual(none, buildConsumerSnapshot({ ...base, avatar_url: undefined }))).toBe(true);
    expect(snapshotsEqual(none, buildConsumerSnapshot({ ...base, avatar_url: '/uploads/a.png' }))).toBe(false);
  });

  it('sorts SO APP ids ascending so the same set in any order is equal', () => {
    const a = buildConsumerSnapshot({ ...base, so_app_user_ids: [3, 1, '2'] });
    const b = buildConsumerSnapshot({ ...base, so_app_user_ids: [2, 3, 1] });
    expect(a.so_app_user_ids).toEqual([1, 2, 3]);
    expect(snapshotsEqual(a, b)).toBe(true);
    expect(snapshotsEqual(a, buildConsumerSnapshot({ ...base, so_app_user_ids: [1, 2] }))).toBe(false);
  });
});
