import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Source-level regression guard: keyword search across modules must NOT depend
 * on the Postgres `unaccent` extension. The extension was removed because the
 * target deployment DB cannot install it. If anyone re-adds `unaccent(` in the
 * files below, this spec fails immediately at CI — well before runtime
 * "function unaccent(text) does not exist" errors hit prod.
 */

const SRC = resolve(__dirname, '..');

const TOUCHED_FILES = [
  'modules/data-access/repository/data-access.repository.ts',
  'modules/data-access/data-access.service.ts',
  'modules/role/role.service.ts',
  'modules/role/repository/role.repository.ts',
  'modules/users/repository/users.repository.ts',
  'modules/permission/repository/permission.repository.ts',
  'modules/module/repository/module-management.repository.ts',
  'modules/change-history/repository/change-history.repository.ts',
];

const ILIKE_EXPECTED_FRAGMENTS: Record<string, string[]> = {
  'modules/data-access/repository/data-access.repository.ts': [
    'role.name ILIKE :keyword',
    'user.full_name ILIKE :keyword',
  ],
  'modules/data-access/data-access.service.ts': [
    'ILIKE ${searchParam}',
  ],
  'modules/role/role.service.ts': [
    'user.full_name ILIKE :search',
    'user.email ILIKE :search',
    'user.username ILIKE :search',
  ],
  'modules/role/repository/role.repository.ts': [
    'name ILIKE :name',
  ],
  'modules/users/repository/users.repository.ts': [
    'user.full_name ILIKE :s',
  ],
  'modules/permission/repository/permission.repository.ts': [
    'permission.name ILIKE :name',
  ],
  'modules/module/repository/module-management.repository.ts': [
    'module.name ILIKE :name',
  ],
  'modules/change-history/repository/change-history.repository.ts': [
    'ch.performed_by ILIKE :pb',
    'ch.entity_name ILIKE :s',
  ],
};

describe('Unaccent removal — source guard', () => {
  describe.each(TOUCHED_FILES)('%s', (rel) => {
    const abs = resolve(SRC, rel);
    const src = readFileSync(abs, 'utf8');

    it('contains no unaccent( call', () => {
      // Allow occurrences inside string-form comments by stripping line comments first.
      const stripped = src
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      expect(stripped).not.toMatch(/unaccent\s*\(/i);
    });

    it('still applies ILIKE for case-insensitive search', () => {
      const fragments = ILIKE_EXPECTED_FRAGMENTS[rel];
      for (const fragment of fragments) {
        expect(src).toContain(fragment);
      }
    });
  });
});
