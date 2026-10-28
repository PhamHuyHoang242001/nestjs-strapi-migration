// Local-only seeder of Data Hub permission test accounts (one role each). Not a migration on purpose: test users
// must never reach shared environments. Safety rails:
// - refuses to run unless NODE_ENV=development and the DB host is local;
// - the password comes from DH_TEST_USER_PASSWORD (never hard-coded);
// - insert-only: an existing user (same username) is left untouched, roles/grants are upserted by name/pair.
// Department memberships are not seeded here; they are added through the department-config API.
//
// Run: DH_TEST_USER_PASSWORD=... npx ts-node -r tsconfig-paths/register src/scripts/seed-data-hub-permission-test-users.ts

import { DataSource, EntityManager } from 'typeorm';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from '@configuration/env.config';
import { hashPassword } from '@common/utils';

interface AccountSpec {
  username: string;
  email: string;
  roleName: string;
  codes: string[];
}

const ACCOUNTS: AccountSpec[] = [
  {
    username: 'dh_ds_creator',
    email: 'dh.ds.creator@vpbank.com.vn',
    roleName: 'DH DS Creator',
    codes: ['dh_data_service_create'],
  },
  {
    username: 'dh_ds_editor',
    email: 'dh.ds.editor@vpbank.com.vn',
    roleName: 'DH DS Editor',
    codes: ['dh_data_service_update'],
  },
  {
    username: 'dh_dict_editor',
    email: 'dh.dict.editor@vpbank.com.vn',
    roleName: 'DH Dictionary Editor',
    codes: ['dh_logical_term_create', 'dh_logical_term_update'],
  },
  {
    username: 'dh_dept_admin',
    email: 'dh.dept.admin@vpbank.com.vn',
    roleName: 'DH Department Admin',
    codes: ['dh_department_view', 'dh_department_create', 'dh_department_update', 'dh_department_delete'],
  },
  { username: 'dh_no_role', email: 'dh.no.role@vpbank.com.vn', roleName: '', codes: [] },
];

function assertLocal(): string {
  const password = process.env.DH_TEST_USER_PASSWORD;
  if (process.env.NODE_ENV !== 'development') throw new Error('Refusing to run: NODE_ENV must be development');
  if (!['localhost', '127.0.0.1', '::1'].includes(String(DB_HOST))) {
    throw new Error('Refusing to run: DB host is not local');
  }
  if (!password || password.length < 10) throw new Error('Set DH_TEST_USER_PASSWORD (min 10 chars)');
  return password;
}

type IdRow = { id: number };

async function upsertRole(m: EntityManager, name: string, permIds: number[]): Promise<number> {
  const found: IdRow[] = await m.query('SELECT id FROM role WHERE name = $1 AND deleted_at IS NULL LIMIT 1', [name]);
  let roleId: number;
  if (found.length) {
    roleId = Number(found[0].id);
  } else {
    const inserted: IdRow[] = await m.query(
      `INSERT INTO role (name, status, created_at, updated_at) VALUES ($1, 'active', NOW(), NOW()) RETURNING id`,
      [name],
    );
    roleId = Number(inserted[0].id);
  }
  for (const permId of permIds) {
    await m.query(
      `INSERT INTO roles_permissions (role_id, permission_id, is_deleted, created_at, updated_at)
       VALUES ($1, $2, false, NOW(), NOW())
       ON CONFLICT (role_id, permission_id) DO UPDATE SET is_deleted = false, deleted_at = NULL, updated_at = NOW()`,
      [roleId, permId],
    );
  }
  return roleId;
}

async function main(): Promise<void> {
  const password = assertLocal();
  const ds = new DataSource({
    type: 'postgres',
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    entities: [],
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  try {
    await ds.transaction(async (m) => {
      const perms: Array<{ id: number; code: string }> = await m.query(
        `SELECT id, code FROM permission WHERE code LIKE 'dh\\_%' AND is_active = true AND deleted_at IS NULL`,
      );
      const permId = new Map(perms.map((p) => [p.code, Number(p.id)]));
      for (const a of ACCOUNTS) {
        const missing = a.codes.filter((c) => !permId.has(c));
        if (missing.length) throw new Error(`Missing permission codes ${missing.join(', ')}: run 2610261000 first`);
        const [existing]: IdRow[] = await m.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [a.username]);
        let userId: number;
        if (existing) {
          userId = Number(existing.id);
        } else {
          const [row]: IdRow[] = await m.query(
            `INSERT INTO users (username, email, full_name, password, type, status, is_active, is_registered, confirmed,
               created_at, updated_at)
             VALUES ($1, $2, $1, $3, 'user', 'active', true, true, true, NOW(), NOW()) RETURNING id`,
            [a.username, a.email, hashPassword(password)],
          );
          userId = Number(row.id);
        }
        if (a.roleName) {
          const roleId = await upsertRole(
            m,
            a.roleName,
            a.codes.map((c) => Number(permId.get(c))),
          );
          const linked: unknown[] = await m.query(
            'SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2 AND deleted_at IS NULL',
            [userId, roleId],
          );
          if (!linked.length) {
            await m.query(
              'INSERT INTO user_roles (user_id, role_id, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
              [userId, roleId],
            );
          }
        }
        const status = existing ? 'kept   ' : 'created';
        console.log(`${status} ${a.email} user#${userId} [${a.codes.join(', ') || 'no role'}]`);
      }
    });
    console.log('Done. Clear their cached codes (redis keys perm:user:<id>:codes) after changing roles.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
