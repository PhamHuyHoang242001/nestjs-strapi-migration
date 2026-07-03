/// <reference types="jest" />
// Explicit jest reference: this spec imports from ../../scripts (outside the src module tree),
// so some editors resolve it via an inferred project that lacks ambient @types/jest globals.
import {
  aggregate,
  buildEmail,
  importAssignments,
  parseSheetRows,
  RoleImportGateway,
} from '../../scripts/import-roles-from-excel';

describe('import-roles-from-excel: pure logic', () => {
  describe('buildEmail', () => {
    it('lowercases and trims token, appends default domain', () => {
      expect(buildEmail('HOANGPHAM ')).toBe('hoangpham@vpbank.com.vn');
      expect(buildEmail('  HungTran')).toBe('hungtran@vpbank.com.vn');
    });

    it('returns null for blank / whitespace tokens', () => {
      expect(buildEmail('')).toBeNull();
      expect(buildEmail('   ')).toBeNull();
      expect(buildEmail(null)).toBeNull();
      expect(buildEmail(undefined)).toBeNull();
    });

    it('honors a custom domain', () => {
      expect(buildEmail('ABC', 'example.com')).toBe('abc@example.com');
    });
  });

  describe('parseSheetRows', () => {
    it('parses valid rows into entries with constructed emails', () => {
      const { entries, warnings } = parseSheetRows([
        ['G_BFM_BSM', 'HOANGPHAM'],
        ['G_BFM_BSM', 'HUNGTRAN'],
        ['G_GM', 'TRANGPT1'],
      ]);
      expect(warnings).toHaveLength(0);
      expect(entries).toEqual([
        { roleCode: 'G_BFM_BSM', email: 'hoangpham@vpbank.com.vn' },
        { roleCode: 'G_BFM_BSM', email: 'hungtran@vpbank.com.vn' },
        { roleCode: 'G_GM', email: 'trangpt1@vpbank.com.vn' },
      ]);
    });

    it('skips fully blank rows silently', () => {
      const { entries, warnings } = parseSheetRows([
        ['', ''],
        ['G_GM', 'TRANGPT1'],
      ]);
      expect(entries).toHaveLength(1);
      expect(warnings).toHaveLength(0);
    });

    it('skips empty-column-B rows silently (no role, no warning) even when a user is present', () => {
      const { entries, warnings } = parseSheetRows([
        ['', 'ORPHANUSER'], // B empty + C present → silent skip
        ['   ', 'ANOTHER'], // B whitespace-only → silent skip
        ['G_OK', 'USERX'], // valid
      ]);
      expect(entries).toEqual([{ roleCode: 'G_OK', email: 'userx@vpbank.com.vn' }]);
      expect(warnings).toHaveLength(0);
    });

    it('warns and skips a row with a role but empty user (column C)', () => {
      const { entries, warnings } = parseSheetRows([['G_CMD_HH', '']]);
      expect(entries).toHaveLength(0);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('missing user');
    });

    it('reports the correct spreadsheet row number (data starts at row 2)', () => {
      const { warnings } = parseSheetRows([['G_X', '']]); // rows[0] => spreadsheet row 2
      expect(warnings[0]).toContain('row 2');
    });

    it('uses provided real row numbers so warnings survive blank interior rows', () => {
      // Simulates a sheet where exceljs skipped a blank row: 2nd entry is really row 9.
      const { warnings } = parseSheetRows(
        [
          ['G_A', 'USERA'],
          ['G_B', ''],
        ],
        'file.xlsx',
        [2, 9],
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('row 9');
    });
  });

  describe('aggregate', () => {
    it('dedups emails per role and keeps roles separate', () => {
      const map = aggregate([
        { roleCode: 'G_BFM_BSM', email: 'a@vpbank.com.vn' },
        { roleCode: 'G_BFM_BSM', email: 'a@vpbank.com.vn' }, // duplicate
        { roleCode: 'G_BFM_BSM', email: 'b@vpbank.com.vn' },
        { roleCode: 'G_GM', email: 'c@vpbank.com.vn' },
      ]);
      expect(map.size).toBe(2);
      expect([...map.get('G_BFM_BSM')]).toEqual(['a@vpbank.com.vn', 'b@vpbank.com.vn']);
      expect([...map.get('G_GM')]).toEqual(['c@vpbank.com.vn']);
    });
  });
});

// In-memory fake gateway recording all interactions.
class FakeGateway implements RoleImportGateway {
  existingRoles = new Map<string, number>(); // code -> id
  usersByEmail = new Map<string, number[]>(); // email -> user ids
  existingMappings = new Set<string>(); // `${roleId}:${userId}`
  createdRoles: string[] = [];
  createdMappings: string[] = [];
  private nextRoleId = 100;

  findRoleIdByCode(code: string): Promise<number | null> {
    return Promise.resolve(this.existingRoles.has(code) ? this.existingRoles.get(code) : null);
  }
  createRole(code: string): Promise<number> {
    const id = this.nextRoleId++;
    this.existingRoles.set(code, id);
    this.createdRoles.push(code);
    return Promise.resolve(id);
  }
  findUserIdsByEmail(email: string): Promise<number[]> {
    return Promise.resolve(this.usersByEmail.get(email) ?? []);
  }
  hasUserRole(roleId: number, userId: number): Promise<boolean> {
    return Promise.resolve(this.existingMappings.has(`${roleId}:${userId}`));
  }
  createUserRole(roleId: number, userId: number): Promise<void> {
    this.createdMappings.push(`${roleId}:${userId}`);
    this.existingMappings.add(`${roleId}:${userId}`);
    return Promise.resolve();
  }
}

describe('import-roles-from-excel: importAssignments', () => {
  it('creates missing role and links resolvable users', async () => {
    const gw = new FakeGateway();
    gw.usersByEmail.set('a@vpbank.com.vn', [11]);
    gw.usersByEmail.set('b@vpbank.com.vn', [12]);

    const summary = await importAssignments(
      gw,
      aggregate([
        { roleCode: 'G_NEW', email: 'a@vpbank.com.vn' },
        { roleCode: 'G_NEW', email: 'b@vpbank.com.vn' },
      ]),
    );

    expect(summary.rolesCreated).toBe(1);
    expect(summary.rolesReused).toBe(0);
    expect(summary.linksCreated).toBe(2);
    expect(gw.createdRoles).toEqual(['G_NEW']);
    expect(gw.createdMappings).toHaveLength(2);
  });

  it('reuses existing role and skips existing mappings', async () => {
    const gw = new FakeGateway();
    gw.existingRoles.set('G_OLD', 5);
    gw.usersByEmail.set('a@vpbank.com.vn', [11]);
    gw.existingMappings.add('5:11'); // already linked

    const summary = await importAssignments(gw, aggregate([{ roleCode: 'G_OLD', email: 'a@vpbank.com.vn' }]));

    expect(summary.rolesCreated).toBe(0);
    expect(summary.rolesReused).toBe(1);
    expect(summary.linksCreated).toBe(0);
    expect(summary.linksSkippedExisting).toBe(1);
    expect(gw.createdMappings).toHaveLength(0);
  });

  it('records users not found and does not link them', async () => {
    const gw = new FakeGateway();
    // no users registered
    const summary = await importAssignments(gw, aggregate([{ roleCode: 'G_NEW', email: 'ghost@vpbank.com.vn' }]));

    expect(summary.usersNotFound).toEqual(['ghost@vpbank.com.vn (role G_NEW)']);
    expect(summary.linksCreated).toBe(0);
    expect(gw.createdMappings).toHaveLength(0);
  });

  it('warns on multi-match email and uses the first id', async () => {
    const gw = new FakeGateway();
    gw.usersByEmail.set('dup@vpbank.com.vn', [11, 22]);
    const summary = await importAssignments(gw, aggregate([{ roleCode: 'G_NEW', email: 'dup@vpbank.com.vn' }]));

    expect(summary.multiMatchWarnings).toHaveLength(1);
    expect(summary.multiMatchWarnings[0]).toContain('using id 11');
    expect(gw.createdMappings).toEqual(['100:11']); // first created role id 100, user 11
  });

  it('dry-run never persists roles or mappings but tallies would-be changes', async () => {
    const gw = new FakeGateway();
    gw.usersByEmail.set('a@vpbank.com.vn', [11]);

    const summary = await importAssignments(gw, aggregate([{ roleCode: 'G_NEW', email: 'a@vpbank.com.vn' }]), {
      dryRun: true,
    });

    expect(summary.rolesCreated).toBe(1);
    expect(summary.linksCreated).toBe(1);
    expect(gw.createdRoles).toHaveLength(0); // nothing persisted
    expect(gw.createdMappings).toHaveLength(0);
  });
});
