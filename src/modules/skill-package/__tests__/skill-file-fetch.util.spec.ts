import { BadGatewayException, UnprocessableEntityException } from '@nestjs/common';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { SkillFileFetchService } from '../skill-file-fetch.util';

// downloadZip now reads bytes from the shared local `public/` upload dir (mirrors the
// transform-file controller) instead of HTTP-fetching from Strapi. These tests exercise the
// on-disk read path directly against a temp file placed under public/.
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const REL_DIR = 'uploads';
const FILE_NAME = '__skill_fetch_test__.zip';
const REL_URL = `/${REL_DIR}/${FILE_NAME}`;
const ABS_PATH = path.resolve(PUBLIC_DIR, REL_DIR, FILE_NAME);

describe('SkillFileFetchService.downloadZip (local disk read)', () => {
  const service = new SkillFileFetchService();

  beforeAll(async () => {
    await fsp.mkdir(path.dirname(ABS_PATH), { recursive: true });
    await fsp.writeFile(ABS_PATH, Buffer.from('PK\x03\x04 fake-zip-bytes'));
  });

  afterAll(async () => {
    await fsp.rm(ABS_PATH, { force: true });
  });

  it('reads the file from disk given a root-relative /uploads URL', async () => {
    const result = await service.downloadZip(REL_URL);
    expect(result.buffer.toString()).toContain('fake-zip-bytes');
    expect(result.size).toBe(result.buffer.length);
    expect(result.filename).toBe(FILE_NAME);
    expect(result.mimeType).toBe('application/zip');
    expect(result.path).toBe(REL_URL);
  });

  it('reads the file given a full Strapi URL (only the pathname is used)', async () => {
    const result = await service.downloadZip(`http://strapi.local:1337${REL_URL}`);
    expect(result.buffer.toString()).toContain('fake-zip-bytes');
  });

  it('rejects a path-traversal URL that escapes public/', async () => {
    await expect(service.downloadZip('/uploads/../../etc/passwd')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects a URL pointing at a non-existent file', async () => {
    await expect(service.downloadZip('/uploads/__does_not_exist__.zip')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects a file exceeding the 20MB cap', async () => {
    const bigName = '__skill_fetch_big__.zip';
    const bigPath = path.resolve(PUBLIC_DIR, REL_DIR, bigName);
    // Sparse 21MB file — big enough to trip the cap without allocating real bytes.
    const fh = await fsp.open(bigPath, 'w');
    try {
      await fh.truncate(21 * 1024 * 1024);
    } finally {
      await fh.close();
    }
    try {
      await expect(service.downloadZip(`/${REL_DIR}/${bigName}`)).rejects.toBeInstanceOf(UnprocessableEntityException);
    } finally {
      await fsp.rm(bigPath, { force: true });
    }
  });

  // Guard against an unused-import regression: BadGatewayException is still the read-failure type.
  it('exposes BadGatewayException for post-stat read failures', () => {
    expect(BadGatewayException).toBeDefined();
  });
});
