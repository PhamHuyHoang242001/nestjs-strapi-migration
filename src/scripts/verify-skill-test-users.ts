/* eslint-disable no-console */
// Verifies the 3 skill test accounts resolve to the expected permission codes through the
// SAME join getUserPermissions() uses: user_roles → role(active) → roles_permissions → permission(active).
// Run: npx ts-node -r tsconfig-paths/register src/scripts/verify-skill-test-users.ts

import { DataSource } from 'typeorm';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from '@configuration/env.config';

const EXPECTED: Record<string, string[]> = {
  'skill.viewer@vpbank.com.vn': [],
  'skill.uploader@vpbank.com.vn': ['skill_upload'],
  'skill.approver@vpbank.com.vn': ['skill_upload', 'skill_approve'],
};

async function main(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME,
    password: DB_PASSWORD, database: DB_NAME, entities: [], synchronize: false, logging: false,
  });
  await ds.initialize();
  let ok = true;
  try {
    for (const [email, expected] of Object.entries(EXPECTED)) {
      const rows = (await ds.query(
        `SELECT DISTINCT p.code
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id AND ur.deleted_at IS NULL
           JOIN role r ON r.id = ur.role_id AND r.status = 'active' AND r.deleted_at IS NULL
           JOIN roles_permissions rp ON rp.role_id = r.id AND rp.deleted_at IS NULL
           JOIN permission p ON p.id = rp.permission_id AND p.is_active = true AND p.deleted_at IS NULL
          WHERE u.email = $1 AND u.status = 'active' AND u.deleted_at IS NULL
            AND p.code IN ('skill_upload','skill_approve')`,
        [email],
      )) as Array<{ code: string }>;
      const got = rows.map((r) => r.code).sort();
      const want = [...expected].sort();
      const pass = JSON.stringify(got) === JSON.stringify(want);
      ok = ok && pass;
      console.log(`  ${pass ? '✓' : '✗'} ${email.padEnd(34)} skill codes: [${got.join(', ') || 'none'}]  expected: [${want.join(', ') || 'none'}]`);
    }
  } finally {
    await ds.destroy();
  }
  console.log(ok ? '\nAll accounts resolve correctly.' : '\nMISMATCH — see above.');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
