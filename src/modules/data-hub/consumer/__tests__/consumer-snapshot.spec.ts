import { buildConsumerSnapshot, snapshotsEqual } from '../consumer-snapshot.util';

const base = {
  code: 'CRM',
  name: 'CRM',
  category: 'INTERNAL_APP',
  division_id: '1',
  department_id: null,
  short_description: 'd',
  status: 'active',
  business_contact_user_ids: [1],
};

describe('consumer snapshot', () => {
  it('has exactly the contract keys in order (business-contact ids only), ids as numbers', () => {
    const s = buildConsumerSnapshot(base);
    expect(Object.keys(s)).toEqual([
      'code',
      'name',
      'category',
      'division_id',
      'department_id',
      'short_description',
      'status',
      'business_contact_user_ids',
    ]);
    expect(s.division_id).toBe(1);
    expect(s.department_id).toBeNull();
  });

  it('detects equality and differences', () => {
    expect(snapshotsEqual(buildConsumerSnapshot(base), buildConsumerSnapshot({ ...base, division_id: 1 }))).toBe(true);
    expect(snapshotsEqual(buildConsumerSnapshot(base), buildConsumerSnapshot({ ...base, name: 'x' }))).toBe(false);
  });

  it('sorts business-contact ids ascending so the same set in any order is equal', () => {
    const a = buildConsumerSnapshot({ ...base, business_contact_user_ids: [3, 1, '2'] });
    const b = buildConsumerSnapshot({ ...base, business_contact_user_ids: [2, 3, 1] });
    expect(a.business_contact_user_ids).toEqual([1, 2, 3]);
    expect(snapshotsEqual(a, b)).toBe(true);
    expect(snapshotsEqual(a, buildConsumerSnapshot({ ...base, business_contact_user_ids: [1, 2] }))).toBe(false);
  });
});
