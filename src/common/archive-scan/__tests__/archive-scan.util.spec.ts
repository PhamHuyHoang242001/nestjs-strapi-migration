import * as path from 'path';
import { isAllowedExt, getArchiveExtension } from '../allowed-extensions.const';
import { isArchiveContentAllowed, validateArchive, ScannableFile } from '../archive-scan.util';

const FIXTURES = path.join(__dirname, 'fixtures');

const file = (name: string): ScannableFile => ({
  path: path.join(FIXTURES, name),
  originalname: name,
});

// A plain file that is never opened — only its extension matters to the scanners.
const plainFile = (name: string): ScannableFile => ({ path: path.join(FIXTURES, 'valid.zip'), originalname: name });

describe('isAllowedExt', () => {
  it.each(['a.pdf', 'a.XLSX', 'deep/dir/skill.md', 'x.py'])('allows %s', (name) => {
    expect(isAllowedExt(name)).toBe(true);
  });

  it.each(['a.exe', 'a.bat', 'noext', 'inner.zip', 'inner.rar'])('rejects %s', (name) => {
    expect(isAllowedExt(name)).toBe(false);
  });
});

describe('getArchiveExtension', () => {
  it('detects archives case-insensitively', () => {
    expect(getArchiveExtension('a.ZIP')).toBe('.zip');
    expect(getArchiveExtension('a.rar')).toBe('.rar');
    expect(getArchiveExtension('a.7z')).toBe('.7z');
  });

  it('returns null for non-archives', () => {
    expect(getArchiveExtension('a.pdf')).toBeNull();
  });
});

describe('isArchiveContentAllowed — zip', () => {
  it('accepts an archive whose entries are all allowed, including nested directories', async () => {
    await expect(isArchiveContentAllowed([file('valid.zip')])).resolves.toBe(true);
  });

  it('rejects an archive containing a .exe', async () => {
    await expect(isArchiveContentAllowed([file('has-exe.zip')])).resolves.toBe(false);
  });

  it('rejects an archive nested inside an archive (.zip is not an allowed entry)', async () => {
    await expect(isArchiveContentAllowed([file('nested-zip.zip')])).resolves.toBe(false);
  });

  it('fails closed on a corrupt archive instead of throwing', async () => {
    await expect(isArchiveContentAllowed([file('corrupt.zip')])).resolves.toBe(false);
  });

  it('fails closed when the file is missing from disk', async () => {
    await expect(
      isArchiveContentAllowed([{ path: path.join(FIXTURES, 'nope.zip'), originalname: 'nope.zip' }]),
    ).resolves.toBe(false);
  });
});

describe('isArchiveContentAllowed — 7z', () => {
  it('accepts a 7z whose entries are all allowed', async () => {
    await expect(isArchiveContentAllowed([file('valid.7z')])).resolves.toBe(true);
  });

  it('rejects a 7z containing a .exe', async () => {
    await expect(isArchiveContentAllowed([file('has-exe.7z')])).resolves.toBe(false);
  });

  it('fails closed on a corrupt 7z', async () => {
    await expect(isArchiveContentAllowed([file('corrupt.7z')])).resolves.toBe(false);
  });
});

describe('isArchiveContentAllowed — non-archive files', () => {
  // Strapi's middleware started from isAccess = true and only flipped it for archives, so a
  // plain file is never extension-checked here. Deliberate parity — see archive-scan.util.ts.
  it.each(['report.pdf', 'sheet.xlsx', 'payload.exe'])('lets %s through unscanned', async (name) => {
    await expect(isArchiveContentAllowed([plainFile(name)])).resolves.toBe(true);
  });

  it('accepts an empty file list', async () => {
    await expect(isArchiveContentAllowed([])).resolves.toBe(true);
  });
});

describe('isArchiveContentAllowed — multiple files', () => {
  it('accepts when every archive is clean', async () => {
    await expect(isArchiveContentAllowed([file('valid.zip'), file('valid.7z'), plainFile('a.pdf')])).resolves.toBe(
      true,
    );
  });

  it('rejects the whole batch when any archive is dirty', async () => {
    await expect(isArchiveContentAllowed([file('valid.zip'), file('has-exe.zip')])).resolves.toBe(false);
  });
});

describe('validateArchive — opposite default to isArchiveContentAllowed', () => {
  it('accepts a clean archive', async () => {
    await expect(validateArchive(file('valid.zip'))).resolves.toBe(true);
  });

  it('rejects a dirty archive', async () => {
    await expect(validateArchive(file('has-exe.zip'))).resolves.toBe(false);
  });

  it('rejects a non-archive, where isArchiveContentAllowed would accept it', async () => {
    const pdf = plainFile('report.pdf');
    await expect(validateArchive(pdf)).resolves.toBe(false);
    await expect(isArchiveContentAllowed([pdf])).resolves.toBe(true);
  });
});

describe('isArchiveContentAllowed — rar', () => {
  // No .rar fixture: node-unrar-js only extracts, and no rar packer exists on the build
  // machine. The library boundary is mocked instead so the iteration logic is still covered.
  const rar = (): ScannableFile => ({ path: path.join(FIXTURES, 'valid.zip'), originalname: 'archive.rar' });

  const mockFileList = (names: string[]) => {
    jest.doMock('node-unrar-js', () => ({
      createExtractorFromData: jest.fn().mockResolvedValue({
        getFileList: () => ({ fileHeaders: names.map((name) => ({ name, flags: { directory: false } })) }),
      }),
    }));
  };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock('node-unrar-js');
  });

  it('accepts a rar whose entries are all allowed', async () => {
    mockFileList(['skill.md', 'scripts/run.py']);
    const { isArchiveContentAllowed: scan } = await import('../archive-scan.util');
    await expect(scan([rar()])).resolves.toBe(true);
  });

  it('rejects a rar containing a .exe', async () => {
    mockFileList(['skill.md', 'payload.exe']);
    const { isArchiveContentAllowed: scan } = await import('../archive-scan.util');
    await expect(scan([rar()])).resolves.toBe(false);
  });

  it('skips directory headers', async () => {
    jest.doMock('node-unrar-js', () => ({
      createExtractorFromData: jest.fn().mockResolvedValue({
        getFileList: () => ({
          fileHeaders: [
            { name: 'scripts', flags: { directory: true } },
            { name: 'scripts/run.py', flags: { directory: false } },
          ],
        }),
      }),
    }));
    const { isArchiveContentAllowed: scan } = await import('../archive-scan.util');
    await expect(scan([rar()])).resolves.toBe(true);
  });

  it('fails closed when the extractor throws', async () => {
    jest.doMock('node-unrar-js', () => ({
      createExtractorFromData: jest.fn().mockRejectedValue(new Error('corrupt rar')),
    }));
    const { isArchiveContentAllowed: scan } = await import('../archive-scan.util');
    await expect(scan([rar()])).resolves.toBe(false);
  });
});
