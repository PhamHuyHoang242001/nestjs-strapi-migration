/**
 * Real-data E2E for POST /v1/role/sync-group-roles.
 *
 * Boots the full AppModule against a real Postgres (env DB_*). Seeds real rows into
 * users / permission / group_role_mappings, calls the endpoint over HTTP, then asserts
 * real DB state in role / user_roles / roles_permissions.
 *
 * Auth: BearerGuard is overridden to inject a seeded user into req.info (keeps the real
 * service-level super_admin gate + real PermissionGuard intact). The injected user is
 * switched per test via `currentTestUser`.
 *
 * Permission codes: the sync constant is mocked to a controlled test code so seeding is
 * deterministic and prod permission rows are never touched.
 *
 * Entities are accessed via their registered NAME (the running DataSource loads compiled
 * dist entities, so passing the TS class to getRepository would miss metadata).
 *
 * Run: `npm run test:e2e` against a disposable test DB.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource, Repository, ObjectLiteral } from 'typeorm';
import { initializeTransactionalContext, StorageDriver } from 'typeorm-transactional';

// Must run before the DI container instantiates the transactional DataSource (mirrors main.ts bootstrap).
initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });

// Controlled permission set — mutated in-place by the missing-code test, restored after.
jest.mock('../src/modules/role/constants/group-role-sync.constants', () => ({
  GROUP_ROLE_PERMISSION_CODES: ['E2E_perm_view'],
  GROUP_ROLE_EMAIL_DOMAIN: '@vpbank.com.vn',
}));

import { AppModule } from '../src/app.module';
import { BASE_URL } from '../src/configuration/env.config';
import { BearerGuard } from '../src/common/guards/bearer.guard';
import { UserType } from '../src/modules/databases/user.entity';
import { GROUP_ROLE_PERMISSION_CODES } from '../src/modules/role/constants/group-role-sync.constants';

// Global prefix (main.ts) + logger middleware both require every route to live under BASE_URL.
const ENDPOINT = `/${BASE_URL}/v1/role/sync-group-roles`;
const PREFIX = 'E2E_';
const DOMAIN = '@vpbank.com.vn';
const TEST_CODE = 'E2E_perm_view';

// Set by tests; the overridden BearerGuard injects this user into req.info.user.
let currentTestUser: Record<string, unknown> | null = null;

describe('GroupRoleSync (e2e, real DB)', () => {
  let app: INestApplication;
  let ds: DataSource;

  let superAdmin: any;
  let normalUser: any;
  let testPermissionId: number;
  const seededUserIds: number[] = [];

  const email = (bare: string) => `${bare.toLowerCase()}${DOMAIN}`;

  // Access by registered entity name — the DataSource loaded compiled dist entities.
  const repo = (name: string): Repository<ObjectLiteral> => ds.getRepository<ObjectLiteral>(name);

  async function seedUser(overrides: Record<string, unknown>): Promise<any> {
    const r = repo('User');
    const u = await r.save(r.create({ type: UserType.USER, ...overrides }));
    seededUserIds.push((u as any).id);
    return u;
  }

  // Delete E2E roles + their join rows so each test starts clean.
  async function cleanupRoles(): Promise<void> {
    const roles = await repo('Role')
      .createQueryBuilder('r')
      .where('r.name LIKE :p', { p: `${PREFIX}%` })
      .getMany();
    const ids = roles.map((r) => (r as any).id);
    if (ids.length) {
      await ds.query(`DELETE FROM roles_permissions WHERE role_id = ANY($1)`, [ids]);
      await ds.query(`DELETE FROM user_roles WHERE role_id = ANY($1)`, [ids]);
      await repo('Role').delete(ids);
    }
  }

  async function clearMappings(): Promise<void> {
    await ds.query(`DELETE FROM group_role_mappings WHERE group_role LIKE $1`, [`${PREFIX}%`]);
  }

  async function seedMapping(type: string, groupRole: string, emailUser: string): Promise<void> {
    const r = repo('GroupRoleMapping');
    await r.save(r.create({ type, group_role: groupRole, email_user: emailUser }));
  }

  async function permIdsForRole(roleId: number): Promise<number[]> {
    const rows: Array<{ permission_id: number }> = await ds.query(
      `SELECT permission_id FROM roles_permissions WHERE role_id = $1`,
      [roleId],
    );
    return rows.map((r) => Number(r.permission_id));
  }

  async function userIdsForRole(roleId: number): Promise<number[]> {
    const links = await repo('UserRole').find({ where: { role_id: roleId } });
    return links.map((l) => (l as any).user_id);
  }

  function callAs(user: Record<string, unknown> | null) {
    currentTestUser = user;
    return request(app.getHttpServer()).post(ENDPOINT);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(BearerGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          if (!currentTestUser) return false;
          req.info = { user: currentTestUser, client: 'admin' };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(BASE_URL); // mirror main.ts so routes resolve under /api
    await app.init();
    ds = app.get(DataSource);

    // Shared seed: users + one real permission matching the mocked code.
    superAdmin = await seedUser({ username: `${PREFIX}super`, email: email('E2E_SUPER'), type: UserType.SUPER_ADMIN });
    normalUser = await seedUser({ username: `${PREFIX}normal`, email: email('E2E_NORMAL'), type: UserType.USER });

    const permRepo = repo('Permission');
    const perm = await permRepo.save(
      permRepo.create({ name: 'E2E Perm View', code: TEST_CODE, method: 'GET', action: 'view', is_active: true }),
    );
    testPermissionId = (perm as any).id;
  });

  afterEach(async () => {
    await cleanupRoles();
    await clearMappings();
    // Keep the constant array stable between tests.
    GROUP_ROLE_PERMISSION_CODES.length = 0;
    GROUP_ROLE_PERMISSION_CODES.push(TEST_CODE);
  });

  afterAll(async () => {
    await cleanupRoles();
    await clearMappings();
    if (seededUserIds.length) await repo('User').delete(seededUserIds);
    if (testPermissionId) await repo('Permission').delete(testPermissionId);
    await app.close();
  });

  // 1. Super_admin gate
  it('rejects a non-super_admin with 403 and creates nothing', async () => {
    await seedMapping('SBD', `${PREFIX}G_GATE`, 'E2E_SUPER');
    await callAs(normalUser).expect(403);
    const role = await repo('Role').findOne({ where: { name: `${PREFIX}G_GATE` } });
    expect(role).toBeNull();
  });

  it('allows super_admin (200)', async () => {
    await callAs(superAdmin).expect(200);
  });

  // 2 + 3. Happy path + grouping (multiple rows same group_role → one role, many users)
  it('creates one role per group_role, attaches fixed permission + all found users', async () => {
    const g = `${PREFIX}G_HH_UH`;
    const uA = await seedUser({ username: `${PREFIX}a`, email: email('E2E_HH_A') });
    const uB = await seedUser({ username: `${PREFIX}b`, email: email('E2E_HH_B') });
    await seedMapping('SBD', g, 'E2E_HH_A');
    await seedMapping('SBD', g, 'E2E_HH_B'); // same group, second user

    const res = await callAs(superAdmin).expect(200);
    const roleReport = res.body.roles.find((r: any) => r.group_role === g);
    expect(roleReport.created).toBe(true);
    expect(roleReport.usersAdded).toBe(2);

    const role = await repo('Role').findOne({ where: { name: g } });
    expect(role).toBeTruthy();
    expect((role as any).code).toBeNull();
    expect(await permIdsForRole((role as any).id)).toContain(testPermissionId);
    const assigned = await userIdsForRole((role as any).id);
    expect(assigned).toEqual(expect.arrayContaining([uA.id, uB.id]));
    expect(assigned).toHaveLength(2);
  });

  // 4. Idempotency — re-run creates no duplicates
  it('is idempotent: second run adds no duplicate role/user/permission rows', async () => {
    const g = `${PREFIX}G_IDEM`;
    const u = await seedUser({ username: `${PREFIX}idem`, email: email('E2E_IDEM') });
    await seedMapping('SBD', g, 'E2E_IDEM');

    await callAs(superAdmin).expect(200);
    const res2 = await callAs(superAdmin).expect(200);
    const rr = res2.body.roles.find((r: any) => r.group_role === g);
    expect(rr.created).toBe(false);
    expect(rr.usersAdded).toBe(0);
    expect(rr.usersSkippedExisting).toBe(1);

    const roles = await repo('Role').find({ where: { name: g } });
    expect(roles).toHaveLength(1);
    const rid = (roles[0] as any).id;
    expect((await userIdsForRole(rid)).filter((id) => id === u.id)).toHaveLength(1);
    expect((await permIdsForRole(rid)).filter((id) => id === testPermissionId)).toHaveLength(1);
  });

  // 5. Existing role — add-only permission sync (never removes prior permissions)
  it('add-only sync: keeps a pre-existing extra permission and adds the fixed one', async () => {
    const g = `${PREFIX}G_EXIST`;
    const permRepo = repo('Permission');
    const extra = await permRepo.save(
      permRepo.create({ name: 'E2E Extra', code: `${PREFIX}extra`, method: 'GET', action: 'view', is_active: true }),
    );
    const extraId = (extra as any).id;
    // Pre-create the role with only the extra permission.
    const roleRepo = repo('Role');
    const role = await roleRepo.save(roleRepo.create({ name: g, permissions: [{ id: extraId }] }));
    const roleId = (role as any).id;

    const u = await seedUser({ username: `${PREFIX}exist`, email: email('E2E_EXIST') });
    await seedMapping('SBD', g, 'E2E_EXIST');

    const res = await callAs(superAdmin).expect(200);
    expect(res.body.roles.find((r: any) => r.group_role === g).created).toBe(false);

    const perms = await permIdsForRole(roleId);
    expect(perms).toEqual(expect.arrayContaining([extraId, testPermissionId])); // extra survived, fixed added
    expect(await userIdsForRole(roleId)).toContain(u.id);

    await permRepo.delete(extraId);
  });

  // 6. Skip missing user — role still created, missing email reported
  it('skips a mapping whose user does not exist and reports it', async () => {
    const g = `${PREFIX}G_MISS_USER`;
    const u = await seedUser({ username: `${PREFIX}present`, email: email('E2E_PRESENT') });
    await seedMapping('SBD', g, 'E2E_PRESENT');
    await seedMapping('SBD', g, 'E2E_GHOST'); // no such user

    const res = await callAs(superAdmin).expect(200);
    const rr = res.body.roles.find((r: any) => r.group_role === g);
    expect(rr.usersNotFound).toContain(email('E2E_GHOST'));
    expect(rr.usersAdded).toBe(1);

    const role = await repo('Role').findOne({ where: { name: g } });
    expect(await userIdsForRole((role as any).id)).toEqual([u.id]);
  });

  // 7. Skip missing permission code — reported, valid perms still attached
  it('reports a fixed code with no matching permission and still creates the role', async () => {
    GROUP_ROLE_PERMISSION_CODES.push(`${PREFIX}missing_code`);
    const g = `${PREFIX}G_MISS_CODE`;
    await seedUser({ username: `${PREFIX}mc`, email: email('E2E_MC') });
    await seedMapping('SBD', g, 'E2E_MC');

    const res = await callAs(superAdmin).expect(200);
    expect(res.body.missingPermissionCodes).toContain(`${PREFIX}missing_code`);

    const role = await repo('Role').findOne({ where: { name: g } });
    expect(await permIdsForRole((role as any).id)).toContain(testPermissionId); // valid code still attached
  });

  // 8. Dedupe — two user rows share an email → assigned once
  it('dedupes duplicate user rows with the same email', async () => {
    const g = `${PREFIX}G_DUP`;
    const dupEmail = email('E2E_DUP');
    await seedUser({ username: `${PREFIX}dup1`, email: dupEmail });
    await seedUser({ username: `${PREFIX}dup2`, email: dupEmail });
    await seedMapping('SBD', g, 'E2E_DUP');

    await callAs(superAdmin).expect(200);
    const role = await repo('Role').findOne({ where: { name: g } });
    const links = await repo('UserRole').find({ where: { role_id: (role as any).id } });
    const uniquePairs = new Set(links.map((l) => `${(l as any).role_id}:${(l as any).user_id}`));
    expect(uniquePairs.size).toBe(links.length); // no duplicate (role_id,user_id) rows
  });

  // 9. Email derivation — uppercase email_user resolves to lowercase email
  it('derives email as lower(email_user)+domain (HOANGPH12 → hoangph12@vpbank.com.vn)', async () => {
    const g = `${PREFIX}G_DERIVE`;
    const u = await seedUser({ username: `${PREFIX}hoang`, email: 'e2e_hoangph12@vpbank.com.vn' });
    await seedMapping('SBD', g, 'E2E_HOANGPH12'); // uppercase

    await callAs(superAdmin).expect(200);
    const role = await repo('Role').findOne({ where: { name: g } });
    expect(await userIdsForRole((role as any).id)).toContain(u.id);
  });
});
