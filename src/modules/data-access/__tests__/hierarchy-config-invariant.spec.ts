import {
  ROOT_OWNER_CONFIG,
  RESOURCE_TYPE_TO_ROOT_TABLE,
} from '../constants/hierarchy-config';

describe('hierarchy-config invariants', () => {
  it('RESOURCE_TYPE_TO_ROOT_TABLE keys match ROOT_OWNER_CONFIG resource types', () => {
    const forwardTypes = new Set(Object.values(ROOT_OWNER_CONFIG).map((e) => e.resourceType));
    const reverseTypes = new Set(Object.keys(RESOURCE_TYPE_TO_ROOT_TABLE));
    expect(reverseTypes).toEqual(forwardTypes);
  });

  it('reverse map values are valid root table names from ROOT_OWNER_CONFIG', () => {
    const forwardTables = new Set(Object.keys(ROOT_OWNER_CONFIG));
    for (const rootTable of Object.values(RESOURCE_TYPE_TO_ROOT_TABLE)) {
      expect(forwardTables.has(rootTable)).toBe(true);
    }
  });

  it('round-trip resource_type → root_table → resource_type matches', () => {
    for (const [rootTable, entry] of Object.entries(ROOT_OWNER_CONFIG)) {
      const reversed = RESOURCE_TYPE_TO_ROOT_TABLE[entry.resourceType];
      expect(reversed).toBe(rootTable);
    }
  });
});
