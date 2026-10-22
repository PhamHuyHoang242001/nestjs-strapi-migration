/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { SkillPackageController } from '../skill-package.controller';

// Both zip downloads (active item, pending version) share one streaming path: same headers,
// same 404 when the stored file is gone. The filename tells the two apart.

function makeRes() {
  const res: any = new PassThrough();
  res.headers = {} as Record<string, string>;
  res.setHeader = (k: string, v: string) => (res.headers[k] = v);
  res.status = jest.fn(() => res);
  return res;
}

async function drain(res: PassThrough): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of res) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

describe('SkillPackageController zip downloads', () => {
  let dir: string;
  let zipPath: string;
  const queryService = { resolveActiveZip: jest.fn(), resolvePendingVersionZip: jest.fn() };
  const fileFetchService = { resolveZipPath: jest.fn() };
  let controller: SkillPackageController;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-zip-'));
    zipPath = path.join(dir, 'a.zip');
    fs.writeFileSync(zipPath, 'ZIPDATA');
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  beforeEach(() => {
    jest.clearAllMocks();
    fileFetchService.resolveZipPath.mockReturnValue(zipPath);
    controller = new SkillPackageController(queryService as any, {} as any, fileFetchService as any, {} as any);
  });

  it('active item download keeps its filename and streams the file', async () => {
    queryService.resolveActiveZip.mockResolvedValue({ fileUrl: '/uploads/a.zip', name: 'My Skill', versionNo: 4 });
    const res = makeRes();

    await controller.downloadZip(1, { info: { user: { id: 10 } } } as any, res);

    expect(res.headers['Content-Type']).toBe('application/zip');
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="my-skill-v4.zip"');
    expect(await drain(res)).toBe('ZIPDATA');
  });

  it('pending version download is named "<slug>-pending-v<next>" and streams the file', async () => {
    queryService.resolvePendingVersionZip.mockResolvedValue({
      fileUrl: '/uploads/p.zip',
      name: 'My Skill',
      versionNo: 5,
    });
    const res = makeRes();

    await controller.downloadPendingVersionZip(55, res);

    expect(queryService.resolvePendingVersionZip).toHaveBeenCalledWith(55);
    expect(fileFetchService.resolveZipPath).toHaveBeenCalledWith('/uploads/p.zip');
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="my-skill-pending-v5.zip"');
    expect(await drain(res)).toBe('ZIPDATA');
  });

  it('pending version download is 404 when the stored file is gone', async () => {
    queryService.resolvePendingVersionZip.mockResolvedValue({ fileUrl: '/uploads/x.zip', name: 'S', versionNo: 1 });
    fileFetchService.resolveZipPath.mockReturnValue(path.join(dir, 'missing.zip'));

    await expect(controller.downloadPendingVersionZip(55, makeRes())).rejects.toBeInstanceOf(NotFoundException);
  });
});
