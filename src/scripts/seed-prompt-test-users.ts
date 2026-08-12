/* eslint-disable no-console */
// One-off, idempotent seeder for THREE Prompt Library test accounts (view / upload / approve).
// Not a migration on purpose: test users must NOT ride the schema-migration chain into prod.
// Reuses the app's own DB env (dotenv via env.config) + bcrypt hashPassword so credentials
// verify through the real login path. Re-runnable: keys users by unique `username`, roles by
// name, role-permission grants via ON CONFLICT.
//
// Run:  npx ts-node -r tsconfig-paths/register src/scripts/seed-prompt-test-users.ts

import { DataSource, EntityManager } from 'typeorm';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from '@configuration/env.config';
import { hashPassword } from '@common/utils';

const PASSWORD = '123456789a@A'; // shared dev password (matches existing sample-user convention)

interface AccountSpec {
  username: string;
  email: string;
  fullName: string;
  roleName: string;
  codes: string[]; // prompt permission codes granted to this account's role
}

const ACCOUNTS: AccountSpec[] = [
  { username: 'prompt_viewer', email: 'prompt.viewer@vpbank.com.vn', fullName: 'Prompt Viewer', roleName: 'Prompt Viewer', codes: [] },
  { username: 'prompt_uploader', email: 'prompt.uploader@vpbank.com.vn', fullName: 'Prompt Uploader', roleName: 'Prompt Uploader', codes: ['prompt_upload'] },
  { username: 'prompt_approver', email: 'prompt.approver@vpbank.com.vn', fullName: 'Prompt Approver', roleName: 'Prompt Approver', codes: ['prompt_upload', 'prompt_approve'] },
];

// Some deployments use singular/plural table names; resolve the live one (mirrors the
// defensive table-candidate pattern used by the permission-seed migrations).
async function resolveTable(m: EntityManager, candidates: string[]): Promise<string> {
  for (const name of candidates) {
    const rows = (await m.query('SELECT to_regclass($1) AS t', [name])) as Array<{ t: string | null }>;
    if (rows[0]?.t) return name;
  }
  throw new Error(`None of the candidate tables exist: ${candidates.join(', ')}`);
}

async function main(): Promise<void> {
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
  const hash = hashPassword(PASSWORD);

  try {
    await ds.transaction(async (m) => {
      const permTable = await resolveTable(m, ['permission', 'permissions']);
      const rolePermTable = await resolveTable(m, ['roles_permissions', 'role_permissions']);

      // Resolve prompt permission ids by code.
      const permRows = (await m.query(
        `SELECT id, code FROM ${permTable} WHERE code IN ('prompt_upload','prompt_approve') AND is_active = true AND deleted_at IS NULL`,
      )) as Array<{ id: number; code: string }>;
      const permId: Record<string, number> = {};
      for (const r of permRows) permId[r.code] = Number(r.id);
      for (const code of ['prompt_upload', 'prompt_approve']) {
        if (!permId[code]) throw new Error(`Permission '${code}' not found in ${permTable} — run the prompt-library migrations first.`);
      }

      for (const a of ACCOUNTS) {
        // Upsert user by unique username.
        const existingUser = (await m.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [a.username])) as Array<{ id: number }>;
        let userId: number;
        if (existingUser.length) {
          userId = Number(existingUser[0].id);
          await m.query(
            `UPDATE users SET email = $1, full_name = $2, password = $3, type = 'user', status = 'active',
             is_active = true, is_registered = true, confirmed = true, blocked = false, deleted_at = NULL, updated_at = NOW()
             WHERE id = $4`,
            [a.email, a.fullName, hash, userId],
          );
        } else {
          const ins = (await m.query(
            `INSERT INTO users (username, email, full_name, password, type, status, is_active, is_registered, confirmed, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'user', 'active', true, true, true, NOW(), NOW()) RETURNING id`,
            [a.username, a.email, a.fullName, hash],
          )) as Array<{ id: number }>;
          userId = Number(ins[0].id);
        }

        // Upsert role by name.
        const existingRole = (await m.query('SELECT id FROM role WHERE name = $1 AND deleted_at IS NULL LIMIT 1', [a.roleName])) as Array<{ id: number }>;
        let roleId: number;
        if (existingRole.length) {
          roleId = Number(existingRole[0].id);
          await m.query(`UPDATE role SET status = 'active', updated_at = NOW() WHERE id = $1`, [roleId]);
        } else {
          const ins = (await m.query(
            `INSERT INTO role (name, status, created_at, updated_at) VALUES ($1, 'active', NOW(), NOW()) RETURNING id`,
            [a.roleName],
          )) as Array<{ id: number }>;
          roleId = Number(ins[0].id);
        }

        // Grant role permissions (idempotent; unique on (role_id, permission_id)).
        for (const code of a.codes) {
          await m.query(
            `INSERT INTO ${rolePermTable} (role_id, permission_id, is_deleted, created_at, updated_at)
             VALUES ($1, $2, false, NOW(), NOW())
             ON CONFLICT (role_id, permission_id) DO UPDATE SET is_deleted = false, deleted_at = NULL, updated_at = NOW()`,
            [roleId, permId[code]],
          );
        }

        // Link user → role (user_roles has no unique constraint; guard by existence).
        const linked = (await m.query('SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2 AND deleted_at IS NULL LIMIT 1', [userId, roleId])) as Array<{ id: number }>;
        if (!linked.length) {
          await m.query('INSERT INTO user_roles (user_id, role_id, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())', [userId, roleId]);
        }

        console.log(`  ✓ ${a.email.padEnd(36)} user#${userId} role#${roleId}  [${a.codes.join(', ') || 'view-only'}]`);
      }
    });

    console.log('\nDone. Login via POST /api/v1/auth/login  { email, password: "' + PASSWORD + '" }');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
