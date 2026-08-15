import { UnprocessableEntityException } from '@nestjs/common';
import {
  validateSkillMd,
  MAX_SKILL_MD_LINES,
  NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} from '../skill-md-validation.util';

// Build a minimal valid skill.md with overridable frontmatter fields + body.
function makeSkillMd(opts: { name?: string; description?: string; body?: string } = {}): string {
  const name = opts.name ?? 'excel-analyzer';
  const description = opts.description ?? 'Analyzes spreadsheets. Use when working with Excel files.';
  const body = opts.body ?? '# Excel Analyzer\n\nInstructions here.\n';
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
}

// Assert the thrown 422 message carries the expected error code prefix.
function expectReject(content: string, code: string): void {
  try {
    validateSkillMd(content);
    fail(`expected validateSkillMd to throw ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).message).toContain(code);
  }
}

describe('validateSkillMd', () => {
  it('accepts a well-formed skill.md', () => {
    expect(() => validateSkillMd(makeSkillMd())).not.toThrow();
  });

  it('accepts quoted description and tolerates a leading BOM', () => {
    const content = '﻿' + makeSkillMd({ description: '"Quoted: does a thing. Use for things."' });
    expect(() => validateSkillMd(content)).not.toThrow();
  });

  describe('line-count cap', () => {
    it('accepts exactly the max number of lines', () => {
      const filler = Array(MAX_SKILL_MD_LINES - 4).fill('text').join('\n');
      expect(() => validateSkillMd(makeSkillMd({ body: filler }))).not.toThrow();
    });

    it('rejects at exactly one line over the cap', () => {
      // makeSkillMd adds 4 frontmatter lines; body of (cap - 3) filler lines => cap + 1 total.
      const filler = Array(MAX_SKILL_MD_LINES - 3).fill('text').join('\n');
      expectReject(makeSkillMd({ body: filler }), 'SKILL_MD_TOO_LONG');
    });
  });

  describe('frontmatter presence', () => {
    it('rejects content with no frontmatter', () => {
      expectReject('# Just a heading\n\nNo frontmatter here.\n', 'SKILL_MD_NO_FRONTMATTER');
    });

    it('rejects an unterminated frontmatter block', () => {
      expectReject('---\nname: excel-analyzer\ndescription: x\n', 'SKILL_MD_NO_FRONTMATTER');
    });
  });

  describe('name field', () => {
    it('rejects a missing name', () => {
      expectReject('---\ndescription: A valid description.\n---\nbody\n', 'SKILL_MD_NAME_MISSING');
    });

    it('rejects uppercase names', () => {
      expectReject(makeSkillMd({ name: 'Excel-Analyzer' }), 'SKILL_MD_NAME_INVALID');
    });

    it('rejects leading/trailing/consecutive hyphens', () => {
      expectReject(makeSkillMd({ name: '-excel' }), 'SKILL_MD_NAME_INVALID');
      expectReject(makeSkillMd({ name: 'excel-' }), 'SKILL_MD_NAME_INVALID');
      expectReject(makeSkillMd({ name: 'excel--analyzer' }), 'SKILL_MD_NAME_INVALID');
    });

    it('rejects a name over the length cap', () => {
      expectReject(makeSkillMd({ name: 'a'.repeat(NAME_MAX_LENGTH + 1) }), 'SKILL_MD_NAME_TOO_LONG');
    });

    it('rejects reserved vendor names', () => {
      expectReject(makeSkillMd({ name: 'claude' }), 'SKILL_MD_NAME_RESERVED');
      expectReject(makeSkillMd({ name: 'anthropic' }), 'SKILL_MD_NAME_RESERVED');
    });
  });

  describe('description field', () => {
    it('rejects a missing description', () => {
      expectReject('---\nname: excel-analyzer\n---\nbody\n', 'SKILL_MD_DESCRIPTION_MISSING');
    });

    it('rejects a description over the length cap', () => {
      expectReject(
        makeSkillMd({ description: 'x'.repeat(DESCRIPTION_MAX_LENGTH + 1) }),
        'SKILL_MD_DESCRIPTION_TOO_LONG',
      );
    });

    it('accepts a multi-line block-scalar description', () => {
      const content =
        '---\nname: excel-analyzer\ndescription: >\n  Analyzes spreadsheets.\n  Use when working with Excel.\n---\n# body\n';
      expect(() => validateSkillMd(content)).not.toThrow();
    });

    it('measures block-scalar length on real content, not the ">" indicator', () => {
      const longLine = '  ' + 'x'.repeat(DESCRIPTION_MAX_LENGTH + 1);
      const content = `---\nname: excel-analyzer\ndescription: |\n${longLine}\n---\n# body\n`;
      expectReject(content, 'SKILL_MD_DESCRIPTION_TOO_LONG');
    });
  });
});
