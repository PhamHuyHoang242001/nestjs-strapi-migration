import { BadRequestException, NotFoundException } from '@nestjs/common';
import AdmZip = require('adm-zip');
import { readZipTextEntry } from '../skill-zip-preview.util';

function zipOf(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

describe('readZipTextEntry', () => {
  const buf = zipOf({
    'skill.md': '---\nname: x\ndescription: yyyyyyyyyyyyyyyyyyyyy.\n---\n',
    'scripts/run.sh': 'echo hi\n',
  });

  it('returns utf-8 content for a nested path (trim + match zip_tree path)', () => {
    expect(readZipTextEntry(buf, '  scripts/run.sh  ')).toEqual({
      path: 'scripts/run.sh',
      content: 'echo hi\n',
    });
  });

  it('404 when path is empty after trim', () => {
    expect(() => readZipTextEntry(buf, '   ')).toThrow(NotFoundException);
  });

  it('404 when entry is missing', () => {
    expect(() => readZipTextEntry(buf, 'nope.txt')).toThrow(NotFoundException);
  });

  it('404 when path is a directory', () => {
    expect(() => readZipTextEntry(buf, 'scripts')).toThrow(NotFoundException);
  });

  it('404 on zip-slip path', () => {
    expect(() => readZipTextEntry(buf, '../secret.txt')).toThrow(NotFoundException);
  });

  it('400 when the entry is binary', () => {
    const binary = zipOf({
      'skill.md': 'md',
      'icon.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]),
    });
    expect(() => readZipTextEntry(binary, 'icon.png')).toThrow(BadRequestException);
  });
});
