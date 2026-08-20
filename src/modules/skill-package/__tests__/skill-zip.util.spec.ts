import { UnprocessableEntityException } from '@nestjs/common';
import AdmZip = require('adm-zip');
import { extractSkillZip } from '../skill-zip.util';

function skillMd(body = '# Body\n'): string {
  return `---\nname: excel-analyzer\ndescription: Analyzes spreadsheets. Use when working with Excel files.\n---\n${body}`;
}

function zipOf(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

function paths(tree: { path: string; isDir: boolean; size: number | null }[]) {
  return tree.map((n) => `${n.isDir ? 'd' : 'f'}:${n.path}`).sort();
}

describe('extractSkillZip', () => {
  it('extracts skill.md and a flat tree including synthesized parent dirs', () => {
    const md = skillMd();
    const buf = zipOf({
      'scripts/run.sh': 'echo hi\n',
      'skill.md': md,
    });
    const { skillMd: content, zipTree } = extractSkillZip(buf);
    expect(content).toBe(md);
    expect(paths(zipTree)).toEqual(['d:scripts', 'f:scripts/run.sh', 'f:skill.md']);
    expect(zipTree.find((n) => n.path === 'scripts')?.size).toBeNull();
    expect(zipTree.find((n) => n.path === 'skill.md')?.size).toBe(md.length);
  });

  it('keeps a wrapper root folder (does not strip common prefix)', () => {
    const md = skillMd();
    const { zipTree } = extractSkillZip(
      zipOf({
        'my-skill/skill.md': md,
        'my-skill/scripts/run.sh': 'x',
      }),
    );
    expect(paths(zipTree)).toEqual(['d:my-skill', 'd:my-skill/scripts', 'f:my-skill/scripts/run.sh', 'f:my-skill/skill.md']);
  });

  it('rejects zip-slip entries', () => {
    const zip = new AdmZip();
    zip.addFile('skill.md', Buffer.from(skillMd(), 'utf8'));
    zip.addFile('secret.txt', Buffer.from('nope', 'utf8'));
    const sneaky = zip.getEntries().find((e) => e.entryName.includes('secret'));
    if (sneaky) sneaky.entryName = '../secret.txt';
    expect(() => extractSkillZip(zip.toBuffer())).toThrow(UnprocessableEntityException);
    try {
      extractSkillZip(zip.toBuffer());
    } catch (err) {
      expect((err as UnprocessableEntityException).message).toContain('ZIP_SLIP');
    }
  });

  it('rejects archives without skill.md', () => {
    expect(() => extractSkillZip(zipOf({ 'README.txt': 'hi' }))).toThrow(/ZIP_NO_SKILL_MD/);
  });

  it('rejects too many entries', () => {
    const files: Record<string, string> = { 'skill.md': skillMd() };
    for (let i = 0; i < 200; i++) files[`f${i}.txt`] = 'x';
    expect(() => extractSkillZip(zipOf(files))).toThrow(/ZIP_TOO_MANY_ENTRIES/);
  });
});
