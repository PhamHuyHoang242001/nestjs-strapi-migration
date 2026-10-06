import { BadRequestException, NotFoundException } from '@nestjs/common';
import AdmZip = require('adm-zip');
import { isPreviewableZipPath, readZipTextEntry } from '../skill-zip-preview.util';

function zipOf(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

describe('isPreviewableZipPath', () => {
  it('allows skill.md and README.md at zip root or one wrapper folder', () => {
    expect(isPreviewableZipPath('skill.md')).toBe(true);
    expect(isPreviewableZipPath('README.md')).toBe(true);
    expect(isPreviewableZipPath('my-skill/skill.md')).toBe(true);
    expect(isPreviewableZipPath('my-skill/README.md')).toBe(true);
  });

  it('rejects nested or other names', () => {
    expect(isPreviewableZipPath('scripts/run.sh')).toBe(false);
    expect(isPreviewableZipPath('my-skill/docs/README.md')).toBe(false);
    expect(isPreviewableZipPath('LICENSE')).toBe(false);
  });
});

describe('readZipTextEntry', () => {
  const buf = zipOf({
    'skill.md': '---\nname: x\ndescription: yyyyyyyyyyyyyyyyyyyyy.\n---\n',
    'README.md': '# Hello\n',
    'scripts/run.sh': 'echo hi\n',
  });

  it('returns utf-8 content for root skill.md (trim)', () => {
    expect(readZipTextEntry(buf, '  skill.md  ')).toEqual({
      path: 'skill.md',
      content: '---\nname: x\ndescription: yyyyyyyyyyyyyyyyyyyyy.\n---\n',
    });
  });

  it('returns README.md at zip root', () => {
    expect(readZipTextEntry(buf, 'README.md')).toEqual({ path: 'README.md', content: '# Hello\n' });
  });

  it('returns wrapper-folder skill.md', () => {
    const wrapped = zipOf({ 'my-skill/skill.md': 'md-body', 'my-skill/README.md': 'r' });
    expect(readZipTextEntry(wrapped, 'my-skill/skill.md')).toEqual({ path: 'my-skill/skill.md', content: 'md-body' });
  });

  it('400 when the path is not a previewable root file', () => {
    expect(() => readZipTextEntry(buf, 'scripts/run.sh')).toThrow(BadRequestException);
  });

  it('404 when path is empty after trim', () => {
    expect(() => readZipTextEntry(buf, '   ')).toThrow(NotFoundException);
  });

  it('404 when a previewable entry is missing from the zip', () => {
    expect(() => readZipTextEntry(buf, 'LICENSE.md')).toThrow(BadRequestException);
    const noReadme = zipOf({ 'skill.md': 'md' });
    expect(() => readZipTextEntry(noReadme, 'README.md')).toThrow(NotFoundException);
  });

  it('404 when path is a directory', () => {
    expect(() => readZipTextEntry(buf, 'scripts')).toThrow(BadRequestException);
  });

  it('404 on zip-slip path', () => {
    expect(() => readZipTextEntry(buf, '../secret.txt')).toThrow(NotFoundException);
  });

  it('400 when an allowed name is binary', () => {
    const binary = zipOf({
      'README.md': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]),
    });
    expect(() => readZipTextEntry(binary, 'README.md')).toThrow(BadRequestException);
  });
});
