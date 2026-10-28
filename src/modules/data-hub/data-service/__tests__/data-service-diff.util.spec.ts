import { diffSnapshots, singleFieldChange, stableStringify } from '../data-service-diff.util';

const base = () => ({
  name: 'A',
  short_description: 'd',
  purpose: null,
  division: { key: 1, label: 'FIN' },
  requesters: [
    { key: 2, label: 'b@x.vn' },
    { key: 1, label: 'a@x.vn' },
  ],
  consumers: [{ key: 5, label: 'APP1' }],
  api_sample_request: { b: 1, a: [1, 2] },
  sftp_port: 22,
});

describe('diffSnapshots', () => {
  it('returns nothing for identical snapshots', () => {
    expect(diffSnapshots(base(), base())).toEqual([]);
  });

  it('reports a changed scalar with section and bilingual labels', () => {
    const changes = diffSnapshots(base(), { ...base(), name: 'B' });
    expect(changes).toEqual([
      { section: 'general', field: 'name', label_vi: 'Tên dịch vụ', label_en: 'Service name', old: 'A', new: 'B' },
    ]);
  });

  it('treats null, undefined and empty string as the same empty value', () => {
    expect(diffSnapshots({ ...base(), purpose: null }, { ...base(), purpose: '' })).toEqual([]);
    const withoutPurpose: Record<string, unknown> = { ...base() };
    delete withoutPurpose.purpose;
    expect(diffSnapshots(base(), withoutPurpose)).toEqual([]);
  });

  it('compares id lists regardless of order and displays sorted labels', () => {
    const reordered = { ...base(), requesters: [...base().requesters].reverse() };
    expect(diffSnapshots(base(), reordered)).toEqual([]);

    const changed = diffSnapshots(base(), {
      ...base(),
      requesters: [{ key: 3, label: 'c@x.vn' }, ...base().requesters],
    });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      section: 'business',
      field: 'requesters',
      old: ['a@x.vn', 'b@x.vn'],
      new: ['a@x.vn', 'b@x.vn', 'c@x.vn'],
    });
  });

  it('compares org refs by id and displays the code', () => {
    const changes = diffSnapshots(base(), { ...base(), division: { key: 2, label: 'OPS' } });
    expect(changes[0]).toMatchObject({ field: 'division', old: 'FIN', new: 'OPS' });
  });

  it('ignores JSON key order but detects value changes', () => {
    expect(diffSnapshots(base(), { ...base(), api_sample_request: { a: [1, 2], b: 1 } })).toEqual([]);
    const changes = diffSnapshots(base(), { ...base(), api_sample_request: { a: [1, 3], b: 1 } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ section: 'technical', field: 'api_sample_request', new: { a: [1, 3], b: 1 } });
  });

  it('compares numbers by value', () => {
    expect(diffSnapshots(base(), { ...base(), sftp_port: 2222 })[0]).toMatchObject({ old: 22, new: 2222 });
  });

  it('with no previous snapshot lists every non-empty field once', () => {
    const changes = diffSnapshots(null, base());
    const fields = changes.map((c) => c.field).sort();
    expect(fields).toEqual(
      ['api_sample_request', 'consumers', 'division', 'name', 'requesters', 'sftp_port', 'short_description'].sort(),
    );
    expect(changes.find((c) => c.field === 'name')).toMatchObject({ old: null, new: 'A' });
  });
});

describe('stableStringify', () => {
  it('sorts object keys recursively', () => {
    expect(stableStringify({ b: { d: 1, c: 2 }, a: [{ y: 1, x: 2 }] })).toBe('{"a":[{"x":2,"y":1}],"b":{"c":2,"d":1}}');
  });
});

describe('singleFieldChange', () => {
  it('builds the status entry', () => {
    expect(singleFieldChange('status', 'active', 'inactive')).toMatchObject({
      section: 'general',
      field: 'status',
      old: 'active',
      new: 'inactive',
    });
  });

  it('rejects unknown fields', () => {
    expect(() => singleFieldChange('nope', 1, 2)).toThrow();
  });
});
