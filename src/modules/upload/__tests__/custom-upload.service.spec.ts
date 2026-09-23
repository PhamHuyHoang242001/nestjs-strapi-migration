import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { bytesToKbytes, CustomUploadService, UploadedDiskFile } from '../custom-upload.service';
import { buildStoredFileName } from '../custom-upload-filename.util';
import { Media } from '@modules/databases/media.entity';
import { MediaRepository } from '../repository/media.repository';

/** Shape the service writes; typed so assertions do not stringify `unknown`. */
interface MediaRow {
  name: string;
  hash: string;
  ext: string;
  mime: string;
  size: number;
  url: string;
  provider: string;
  created_by_id: number | null;
  updated_by_id: number | null;
}

describe('buildStoredFileName', () => {
  it('keeps a slugified base name and appends a random suffix', () => {
    const { hash, ext, fileName } = buildStoredFileName('Báo Cáo Quý 3.XLSX');
    expect(hash).toMatch(/^bao_cao_quy_3_[0-9a-f]{10}$/);
    expect(ext).toBe('.xlsx');
    expect(fileName).toBe(`${hash}.xlsx`);
  });

  it('strips Vietnamese đ and diacritics', () => {
    expect(buildStoredFileName('Đơn hàng.pdf').hash).toMatch(/^don_hang_[0-9a-f]{10}$/);
  });

  it('never collides for the same original name', () => {
    const a = buildStoredFileName('report.pdf');
    const b = buildStoredFileName('report.pdf');
    expect(a.fileName).not.toBe(b.fileName);
  });

  it('handles a name with no extension', () => {
    const { ext, fileName, hash } = buildStoredFileName('README');
    expect(ext).toBe('');
    expect(fileName).toBe(hash);
  });

  it('falls back when the name slugs down to nothing', () => {
    expect(buildStoredFileName('___.png').hash).toMatch(/^file_[0-9a-f]{10}$/);
  });

  it.each([
    ['../../../etc/passwd', ''],
    ['a/../../b.pdf', '.pdf'],
    ['C:\\win\\sys.dll', '.dll'],
    ['x.pdf/../../evil', ''],
  ])('strips path separators from %s', (input, expectedExt) => {
    const { fileName, ext } = buildStoredFileName(input);
    expect(fileName).not.toMatch(/[/\\]/);
    expect(fileName).not.toContain('..');
    expect(ext).toBe(expectedExt);
  });

  it.each(['x.<script>', 'x.a"b', "x.a'b", 'x.' + 'a'.repeat(30)])(
    'drops a bogus extension from %s rather than writing it into the public url',
    (input) => {
      expect(buildStoredFileName(input).ext).toBe('');
    },
  );

  it('keeps ordinary extensions intact', () => {
    expect(buildStoredFileName('a.PDF').ext).toBe('.pdf');
    expect(buildStoredFileName('a.tar.gz').ext).toBe('.gz');
  });
});

describe('bytesToKbytes', () => {
  // Strapi stores kilobytes, not bytes — rows written here must match migrated Strapi rows.
  it.each([
    [0, 0],
    [1000, 1],
    [1536, 1.54],
    [2_500_000, 2500],
  ])('converts %i bytes to %s KB', (bytes, expected) => {
    expect(bytesToKbytes(bytes)).toBe(expected);
  });
});

describe('CustomUploadService', () => {
  let service: CustomUploadService;
  let repository: jest.Mocked<Pick<MediaRepository, 'create' | 'save'>>;
  let tempDir: string;
  // Scratch destination so specs never write into the real public/uploads, which parallel
  // jest workers would share and a failed assertion would litter.
  let uploadDir: string;

  const makeTempFile = async (originalname: string, content = 'x'): Promise<UploadedDiskFile> => {
    const filePath = path.join(tempDir, `${Math.random().toString(36).slice(2)}.tmp`);
    await fsp.writeFile(filePath, content);
    return { path: filePath, originalname, mimetype: 'application/pdf', size: content.length };
  };

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'custom-upload-spec-'));
    uploadDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'custom-upload-dest-'));
    repository = {
      create: jest.fn((payload: unknown) => payload),
      save: jest.fn((payload: unknown) => Promise.resolve(payload)),
    } as unknown as jest.Mocked<Pick<MediaRepository, 'create' | 'save'>>;
    service = new CustomUploadService(repository as unknown as MediaRepository, uploadDir);
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true });
    await fsp.rm(uploadDir, { recursive: true, force: true });
  });

  describe('moveAndCreateMedia', () => {
    it('moves the file out of temp into the upload dir', async () => {
      const file = await makeTempFile('report.pdf');

      const [media] = (await service.moveAndCreateMedia([file], {})) as unknown as [MediaRow];

      await expect(fsp.access(file.path)).rejects.toThrow(); // temp copy is gone
      const stored = path.join(uploadDir, `${media.hash}.pdf`);
      await expect(fsp.access(stored)).resolves.toBeUndefined();
    });

    it('writes a Strapi-shaped media row', async () => {
      const file = await makeTempFile('Báo Cáo.pdf', 'hello world');

      const [media] = (await service.moveAndCreateMedia([file], { user: { id: 42 } })) as unknown as [MediaRow];

      expect(media).toMatchObject({
        name: 'Báo Cáo.pdf',
        ext: '.pdf',
        mime: 'application/pdf',
        size: bytesToKbytes(11),
        provider: 'local',
        created_by_id: 42,
        updated_by_id: 42,
      });
      expect(media.hash).toMatch(/^bao_cao_[0-9a-f]{10}$/);
      expect(media.url).toBe(`/uploads/${media.hash}.pdf`);
    });

    it('records a null uploader when the request carries no user', async () => {
      const file = await makeTempFile('a.pdf');

      const [media] = (await service.moveAndCreateMedia([file], {})) as unknown as [MediaRow];

      expect(media.created_by_id).toBeNull();
    });

    it('stores every file of a multi-file upload', async () => {
      const files = [await makeTempFile('a.pdf'), await makeTempFile('b.pdf'), await makeTempFile('c.pdf')];

      const media = (await service.moveAndCreateMedia(files, {})) as unknown as MediaRow[];

      expect(media).toHaveLength(3);
      expect(repository.save).toHaveBeenCalledTimes(3);
    });

    it('unpublishes earlier files when a later one fails', async () => {
      // Otherwise a failure on file 3 leaves files 1-2 publicly served with the client
      // holding a 500 and no handle to them.
      const files = [await makeTempFile('a.pdf'), await makeTempFile('b.pdf'), await makeTempFile('c.pdf')];
      const echo = (p: unknown) => Promise.resolve(p) as Promise<Media>;
      repository.save
        .mockImplementationOnce(echo)
        .mockImplementationOnce(echo)
        .mockRejectedValueOnce(new Error('db down'));

      await expect(service.moveAndCreateMedia(files, {})).rejects.toThrow('db down');

      await expect(fsp.readdir(uploadDir)).resolves.toEqual([]);
    });

    it('falls back to the extension when the client sends a generic mimetype', async () => {
      const file = await makeTempFile('sheet.csv');
      file.mimetype = 'application/octet-stream';

      const [media] = (await service.moveAndCreateMedia([file], {})) as unknown as [MediaRow];

      expect(media.mime).toBe('text/csv');
    });
  });

  describe('cleanupTempFiles', () => {
    it('removes leftover temp files', async () => {
      const file = await makeTempFile('a.pdf');

      await service.cleanupTempFiles([file]);

      await expect(fsp.access(file.path)).rejects.toThrow();
    });

    it('stays silent when the file is already gone', async () => {
      const file = await makeTempFile('a.pdf');
      await fsp.unlink(file.path);

      await expect(service.cleanupTempFiles([file])).resolves.toBeUndefined();
    });
  });
});
