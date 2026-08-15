/**
 * Real-data E2E for the Skill Package workspace full flow: upload -> approve -> view.
 *
 * Boots the full AppModule against a real Postgres (env DB_*). Drives the exact HTTP
 * endpoints the FE asset-hub module calls (see EDA_FE/src/modules/asset-hub/pages/skill/api/skillApi.ts):
 *   POST   /v1/skill/items                 (uploadNew)
 *   PUT    /v1/skill/items/:id/versions    (uploadUpdate)
 *   GET    /v1/skill/items                 (list)
 *   GET    /v1/skill/items/:id             (detail)
 *   GET    /v1/skill/reviews               (reviews)
 *   GET    /v1/skill/versions/:vid/diff    (diff)
 *   POST   /v1/skill/versions/:vid/approve (approve)
 *   POST   /v1/skill/versions/:vid/reject  (reject)
 *   PATCH  /v1/skill/items/:id/status      (toggleStatus)
 *   GET    /v1/skill/my-permissions        (myPermissions)
 *
 * Auth: BearerGuard is overridden to inject a seeded user into req.info (the real
 * PermissionGuard + service-level authz stay intact). The active user switches per
 * request via `currentTestUser`.
 *
 * File I/O: pull-based upload. The client sends a Strapi zip_url; the backend fetches
 * it via SkillFileFetchService. That service is overridden here with a stub that returns
 * an in-memory zip (built with adm-zip) keyed by the zip_url — so no network call is made
 * yet zip parsing / skill.md extraction runs for real.
 *
 * Entities are accessed by their registered class NAME (the running DataSource loads
 * TS entity classes under ts-jest).
 *
 * Run: `npm run test:e2e` against a disposable test DB with skill_* tables + perms 108/109.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
// adm-zip is a CommonJS constructor export; import-equals avoids the missing
// esModuleInterop default-interop helper under this repo's ts-jest config.
import AdmZip = require('adm-zip');
import { DataSource, Repository, ObjectLiteral } from 'typeorm';
import { initializeTransactionalContext, StorageDriver } from 'typeorm-transactional';

// Must run before the DI container instantiates the transactional DataSource (mirrors main.ts bootstrap).
initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });

import { AppModule } from '../src/app.module';
import { BASE_URL } from '../src/configuration/env.config';
import { BearerGuard } from '../src/common/guards/bearer.guard';
import { SkillFileFetchService } from '../src/modules/skill-package/skill-file-fetch.util';
import { UserType } from '../src/modules/databases/user.entity';
import { STATUS } from '../src/common/enums';

const BASE = `/${BASE_URL}/v1/skill`;
// Deliberately does NOT start with 'E2E_' so a sibling e2e's `LIKE 'E2E_%'`
// role cleanup can never delete this suite's seeded roles mid-run.
const PREFIX = 'SKILLE2E_';

// Build an in-memory zip containing skill.md (parsed for real by extractSkillMdFromZip).
function makeZip(skillMd: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('skill.md', Buffer.from(skillMd, 'utf8'));
  zip.addFile('README.txt', Buffer.from('noise entry', 'utf8'));
  return zip.toBuffer();
}

// Wrap a markdown body with the frontmatter the Agent Skills standard requires, so
// every uploaded skill.md passes validateSkillMd (name + description + line cap).
function skillMd(body: string, name = 'excel-analyzer'): string {
  return `---\nname: ${name}\ndescription: A test skill. Use when running the e2e suite.\n---\n${body}`;
}

// Maps each generated zip_url to the skill.md content the fetch stub should return,
// so different uploads (v1/v2) yield different parsed content.
const zipContentByUrl = new Map<string, string>();
let zipUrlSeq = 0;

// Stub for SkillFileFetchService: returns a real in-memory zip keyed by zip_url —
// exercises the real unzip/validate path without any network I/O.
const fileFetchStub = {
  downloadZip: async (url: string) => {
    const md = zipContentByUrl.get(url) ?? skillMd('# default skill\n');
    const buffer = makeZip(md);
    return {
      buffer,
      mimeType: 'application/zip',
      size: buffer.length,
      filename: 'skill.zip',
      originalName: 'skill.zip',
      path: url,
    };
  },
  buildAvatarMedia: (url: string) => ({
    filename: 'avatar.png',
    originalName: 'avatar.png',
    mimeType: 'image/png',
    path: url,
  }),
};

// Set by tests; the overridden BearerGuard injects this user into req.info.user.
let currentTestUser: Record<string, unknown> | null = null;

describe('SkillPackage full flow (e2e, real DB): upload -> approve -> view', () => {
  let app: INestApplication;
  let ds: DataSource;

  let uploader: any; // holds skill_upload
  let approver: any; // holds skill_approve
  let outsider: any; // no skill perms
  const seededUserIds: number[] = [];
  const seededRoleIds: number[] = [];
  const createdPackageIds: number[] = [];

  const repo = (name: string): Repository<ObjectLiteral> => ds.getRepository<ObjectLiteral>(name);

  async function seedUser(overrides: Record<string, unknown>): Promise<any> {
    const r = repo('User');
    const u = await r.save(r.create({ type: UserType.USER, ...overrides }));
    seededUserIds.push((u as any).id);
    return u;
  }

  // Create an ACTIVE role granting the given permission code, then attach the user.
  async function grantCode(user: any, roleName: string, permCode: string): Promise<void> {
    const permRow = await repo('Permission').findOne({ where: { code: permCode } });
    if (!permRow) throw new Error(`Permission ${permCode} not seeded in test DB`);

    const roleRepo = repo('Role');
    const role = await roleRepo.save(roleRepo.create({ name: roleName, status: STATUS.ACTIVE }));
    seededRoleIds.push((role as any).id);

    const rpRepo = repo('RolePermission');
    await rpRepo.save(rpRepo.create({ role_id: (role as any).id, permission_id: (permRow as any).id }));

    const urRepo = repo('UserRole');
    await urRepo.save(urRepo.create({ user_id: (user as any).id, role_id: (role as any).id }));
  }

  function as(user: Record<string, unknown> | null) {
    currentTestUser = user;
    return request(app.getHttpServer());
  }

  // Pull-based upload helper: registers the skill.md the fetch stub will return for a
  // freshly-minted zip_url, then POSTs the JSON body the FE sends (zip_url + fields + tags).
  // method: create-package (`POST /items`) stays POST; create-version (`PUT /items/:id/versions`)
  // passes 'put'. Body/response identical across both verbs.
  function uploadReq(
    user: any,
    path: string,
    fields: Record<string, string>,
    tags: string[],
    zipMd: string,
    method: 'post' | 'put' = 'post',
  ) {
    zipUrlSeq += 1;
    const zipUrl = `http://strapi.test/uploads/skill-${zipUrlSeq}.zip`;
    zipContentByUrl.set(zipUrl, zipMd);
    return as(user)[method](path).send({ ...fields, tags, zip_url: zipUrl });
  }

  async function hardDeletePackage(pkgId: number): Promise<void> {
    // Order respects FKs: clear active_version_id first (package → active_version), then delete
    // versions. skill_version_files rows cascade-delete with their version (ON DELETE CASCADE).
    await ds.query('UPDATE skill_packages SET active_version_id = NULL WHERE id = $1', [pkgId]);
    await ds.query('DELETE FROM skill_versions WHERE skill_package_id = $1', [pkgId]);
    await ds.query('DELETE FROM skill_packages WHERE id = $1', [pkgId]);
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
      .overrideProvider(SkillFileFetchService)
      .useValue(fileFetchStub)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(BASE_URL); // mirror main.ts so routes resolve under /api
    await app.init();
    ds = app.get(DataSource);

    uploader = await seedUser({ username: `${PREFIX}uploader`, email: `${PREFIX}uploader@test.local`.toLowerCase() });
    approver = await seedUser({ username: `${PREFIX}approver`, email: `${PREFIX}approver@test.local`.toLowerCase() });
    outsider = await seedUser({ username: `${PREFIX}outsider`, email: `${PREFIX}outsider@test.local`.toLowerCase() });

    await grantCode(uploader, `${PREFIX}ROLE_UPLOAD`, 'skill_upload');
    await grantCode(approver, `${PREFIX}ROLE_APPROVE`, 'skill_approve');
  });

  afterAll(async () => {
    for (const pkgId of createdPackageIds) {
      try { await hardDeletePackage(pkgId); } catch { /* best-effort cleanup */ }
    }
    if (seededRoleIds.length) {
      await ds.query('DELETE FROM roles_permissions WHERE role_id = ANY($1)', [seededRoleIds]);
      await ds.query('DELETE FROM user_roles WHERE role_id = ANY($1)', [seededRoleIds]);
      await ds.query('DELETE FROM role WHERE id = ANY($1)', [seededRoleIds]);
    }
    if (seededUserIds.length) await ds.query('DELETE FROM users WHERE id = ANY($1)', [seededUserIds]);
    await app.close();
  });

  // ---- Permission surface -----------------------------------------------------

  it('my-permissions reflects each seeded user\'s real grants', async () => {
    const up = await as(uploader).get(`${BASE}/my-permissions`).expect(200);
    expect(up.body).toEqual({ canUpload: true, canApprove: false });

    const ap = await as(approver).get(`${BASE}/my-permissions`).expect(200);
    expect(ap.body).toEqual({ canUpload: false, canApprove: true });

    const out = await as(outsider).get(`${BASE}/my-permissions`).expect(200);
    expect(out.body).toEqual({ canUpload: false, canApprove: false });
  });

  it('rejects upload from a user lacking skill_upload (403)', async () => {
    await uploadReq(outsider, `${BASE}/items`,
      { name: `${PREFIX}denied`, short_description: 'no perm', category: 'general' }, [], skillMd('# denied\n'))
      .expect(403);
  });

  // ---- Full happy path --------------------------------------------------------

  const MD_V1 = skillMd('# Excel Analyzer\n\nAnalyzes spreadsheets.\n');
  let packageId: number;
  let versionOneId: number;

  it('1) uploader creates a package (pending v1) and DB reflects it', async () => {
    const res = await uploadReq(uploader, `${BASE}/items`,
      { name: `${PREFIX}Excel Analyzer`, short_description: 'Analyzes spreadsheets', category: 'data-analysis' },
      ['excel', 'data'], MD_V1,
    ).expect(201);

    expect(res.body.package?.id).toBeDefined();
    expect(res.body.version?.version_no).toBe(1);
    packageId = res.body.package.id;
    versionOneId = res.body.version.id;
    createdPackageIds.push(packageId);

    const pkg = await repo('SkillPackage').findOne({ where: { id: packageId } });
    expect((pkg as any).status).toBe('active');
    expect((pkg as any).active_version_id).toBeNull(); // not promoted until approved

    const ver = await repo('SkillVersion').findOne({ where: { id: versionOneId } });
    expect((ver as any).state).toBe('pending');
    expect((ver as any).skill_md_content).toBe(MD_V1); // zip parsed for real
    expect((ver as any).tags).toEqual(['excel', 'data']);
  });

  it('2) pending package is NOT visible in the published list', async () => {
    const res = await as(outsider).get(`${BASE}/items`).query({ limit: 100 }).expect(200);
    const ids = res.body.data.map((p: any) => p.id);
    expect(ids).not.toContain(packageId);
  });

  it('3) approver sees the pending version in the review queue', async () => {
    const res = await as(approver).get(`${BASE}/reviews`).query({ scope: 'all', limit: 100 }).expect(200);
    const found = res.body.data.find((v: any) => v.id === versionOneId);
    expect(found).toBeTruthy();
    expect(found.state).toBe('pending');
  });

  it('3b) non-approver is forced to own-scope in the review queue (cannot see others\' pending)', async () => {
    // outsider submitted nothing → own-scoped queue is empty even with scope=all.
    const res = await as(outsider).get(`${BASE}/reviews`).query({ scope: 'all', limit: 100 }).expect(200);
    expect(res.body.data.find((v: any) => v.id === versionOneId)).toBeUndefined();
  });

  it('4) approver reads the diff (base null for first version, incoming = skill.md)', async () => {
    const res = await as(approver).get(`${BASE}/versions/${versionOneId}/diff`).expect(200);
    expect(res.body.base).toBeNull();
    expect(res.body.incoming).toBe(MD_V1);
    expect(res.body.metadata.version_no).toBe(1);
  });

  it('4b) an unrelated user cannot read the diff (403)', async () => {
    await as(outsider).get(`${BASE}/versions/${versionOneId}/diff`).expect(403);
  });

  it('5) uploader (no skill_approve) cannot approve (403); state unchanged', async () => {
    await as(uploader).post(`${BASE}/versions/${versionOneId}/approve`).expect(403);
    const ver = await repo('SkillVersion').findOne({ where: { id: versionOneId } });
    expect((ver as any).state).toBe('pending');
  });

  it('6) approver approves; version promoted to active atomically', async () => {
    const res = await as(approver).post(`${BASE}/versions/${versionOneId}/approve`).expect(201);
    expect(res.body).toEqual({ version_id: versionOneId, package_id: packageId });

    const ver = await repo('SkillVersion').findOne({ where: { id: versionOneId } });
    expect((ver as any).state).toBe('approved');
    expect((ver as any).reviewed_by).toBe(approver.id);

    const pkg = await repo('SkillPackage').findOne({ where: { id: packageId } });
    expect((pkg as any).active_version_id).toBe(versionOneId);
  });

  it('7) approved package now appears in the published list with active version fields', async () => {
    const res = await as(outsider).get(`${BASE}/items`).query({ limit: 100 }).expect(200);
    const item = res.body.data.find((p: any) => p.id === packageId);
    expect(item).toBeTruthy();
    expect(item.active_version.name).toBe(`${PREFIX}Excel Analyzer`);
    expect(item.active_version.version_no).toBe(1);
  });

  it('8) detail returns active version + full version history', async () => {
    const res = await as(outsider).get(`${BASE}/items/${packageId}`).expect(200);
    expect(res.body.active_version.id).toBe(versionOneId);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].skill_md_content).toBe(MD_V1);
  });

  // ---- Second version: update -> approve -> active flips ----------------------

  const MD_V2 = skillMd('# Excel Analyzer\n\nAnalyzes spreadsheets AND pivots.\n');
  let versionTwoId: number;

  it('9) uploader submits v2 (pending); active still points at v1', async () => {
    const res = await uploadReq(uploader, `${BASE}/items/${packageId}/versions`,
      { name: `${PREFIX}Excel Analyzer`, short_description: 'Now with pivots', category: 'data-analysis' },
      ['excel'], MD_V2, 'put',
    ).expect(200);
    expect(res.body.version.version_no).toBe(2);
    versionTwoId = res.body.version.id;

    const pkg = await repo('SkillPackage').findOne({ where: { id: packageId } });
    expect((pkg as any).active_version_id).toBe(versionOneId); // unchanged until approved
  });

  it('9b) a second pending version is blocked while one is already pending (409)', async () => {
    await uploadReq(uploader, `${BASE}/items/${packageId}/versions`,
      { name: `${PREFIX}Excel Analyzer`, short_description: 'dup pending', category: 'data-analysis' },
      [], skillMd('# dup\n'), 'put',
    ).expect(409);
  });

  it('10) v2 diff shows v1 content as base and v2 as incoming', async () => {
    const res = await as(approver).get(`${BASE}/versions/${versionTwoId}/diff`).expect(200);
    expect(res.body.base).toBe(MD_V1);
    expect(res.body.incoming).toBe(MD_V2);
  });

  it('11) approving v2 flips the active version; list/detail reflect v2', async () => {
    await as(approver).post(`${BASE}/versions/${versionTwoId}/approve`).expect(201);

    const pkg = await repo('SkillPackage').findOne({ where: { id: packageId } });
    expect((pkg as any).active_version_id).toBe(versionTwoId);

    const detail = await as(outsider).get(`${BASE}/items/${packageId}`).expect(200);
    expect(detail.body.active_version.id).toBe(versionTwoId);
    expect(detail.body.active_version.short_description).toBe('Now with pivots');
    expect(detail.body.versions).toHaveLength(2);
  });

  // ---- Toggle status: hide/show -----------------------------------------------

  it('12) approver can hide the package (inactive) -> drops out of list + detail 404', async () => {
    await as(approver).patch(`${BASE}/items/${packageId}/status`).send({ status: 'inactive' }).expect(200);

    const list = await as(outsider).get(`${BASE}/items`).query({ limit: 100 }).expect(200);
    expect(list.body.data.find((p: any) => p.id === packageId)).toBeUndefined();

    await as(outsider).get(`${BASE}/items/${packageId}`).expect(404);

    // restore for deterministic teardown
    await as(approver).patch(`${BASE}/items/${packageId}/status`).send({ status: 'active' }).expect(200);
  });

  // ---- Reject path on a fresh package -----------------------------------------

  it('13) reject requires a reason (400) and marks the version rejected', async () => {
    const created = await uploadReq(uploader, `${BASE}/items`,
      { name: `${PREFIX}ToReject`, short_description: 'will be rejected', category: 'other' }, [], skillMd('# reject me\n'),
    ).expect(201);
    const rejectPkgId = created.body.package.id;
    const rejectVerId = created.body.version.id;
    createdPackageIds.push(rejectPkgId);

    await as(approver).post(`${BASE}/versions/${rejectVerId}/reject`).send({ reason: '' }).expect(400);

    await as(approver).post(`${BASE}/versions/${rejectVerId}/reject`).send({ reason: 'missing tests' }).expect(201);
    const ver = await repo('SkillVersion').findOne({ where: { id: rejectVerId } });
    expect((ver as any).state).toBe('rejected');
    expect((ver as any).reject_reason).toBe('missing tests');
  });
});
