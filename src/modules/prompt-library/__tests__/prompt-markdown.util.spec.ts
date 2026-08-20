import { buildPromptMarkdown } from '../prompt-markdown.util';
import { PromptVersion } from '@modules/databases/prompt-version.entity';
import { AssetHubTagKind } from '@modules/databases/asset-hub-tag.entity';
import type { TagRef } from '@modules/asset-hub-catalog/asset-hub-item-meta-read.service';

// Build a PromptVersion-shaped object for the pure builder (only the fields it reads matter).
function makeVersion(overrides: Partial<PromptVersion> = {}): PromptVersion {
  return {
    name: 'Code Review Assistant',
    category_id: 7,
    version_no: 3,
    short_description: 'Reviews code for quality.',
    prompt_content: 'You are an expert code reviewer.',
    changelog_note: null,
    created_at: new Date('2026-08-12T10:00:00Z'),
    submitted_by: 42,
    ...overrides,
  } as PromptVersion;
}

// Tags are catalog rows now and travel as a separate argument, not on the version.
const TAGS: TagRef[] = [
  { id: 1, name: 'review', kind: AssetHubTagKind.ENTERPRISE },
  { id: 2, name: 'quality', kind: AssetHubTagKind.PERSONAL },
];

// Extract the frontmatter block (between the first two '---' fences).
function frontmatter(md: string): string {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}

describe('buildPromptMarkdown', () => {
  it('emits YAML frontmatter with all metadata fields', () => {
    const md = buildPromptMarkdown(makeVersion(), 'user@example.com', 'engineering', TAGS);
    const fm = frontmatter(md);
    expect(fm).toContain('title: "Code Review Assistant"');
    expect(fm).toContain('category: "engineering"');
    expect(fm).toContain('version: 3'); // numeric, unquoted
    expect(fm).toContain('author: "user@example.com"');
    expect(fm).toContain('created: "2026-08-12"');
    expect(fm).toContain('tags: ["review", "quality"]');
  });

  it('embeds the title, short_description and prompt_content verbatim in the body', () => {
    const md = buildPromptMarkdown(makeVersion(), 'user@example.com');
    expect(md).toContain('# Code Review Assistant');
    expect(md).toContain('> Reviews code for quality.');
    expect(md).toContain('## Prompt\n\nYou are an expert code reviewer.');
    expect(md).toContain('## Usage Notes');
  });

  it('escapes a hostile title so it cannot break out of the YAML scalar', () => {
    const md = buildPromptMarkdown(
      makeVersion({ name: 'Evil": true\nowned: yes' }),
      'user@example.com',
    );
    const fm = frontmatter(md);
    // Quote and backslash escaped; newline flattened to a space → stays one line.
    expect(fm).toContain('title: "Evil\\": true owned: yes"');
    // No stray un-escaped injected key on its own line inside frontmatter.
    expect(fm.split('\n').some((l) => l.trim() === 'owned: yes')).toBe(false);
  });

  it('renders tag NAMES, so the exported file stays readable outside this system', () => {
    expect(frontmatter(buildPromptMarkdown(makeVersion(), 'a@b.c', null, TAGS))).toContain(
      'tags: ["review", "quality"]',
    );
  });

  it('escapes a hostile tag name so it cannot break out of the YAML flow array', () => {
    const hostile: TagRef[] = [{ id: 9, name: 'evil", owned: yes', kind: AssetHubTagKind.PERSONAL }];

    const fm = frontmatter(buildPromptMarkdown(makeVersion(), 'a@b.c', null, hostile));

    expect(fm).toContain('tags: ["evil\\", owned: yes"]');
    expect(fm.split('\n').some((l) => l.trim() === 'owned: yes')).toBe(false);
  });

  it('serializes empty tags as [] and coerces a missing or null tag list', () => {
    expect(frontmatter(buildPromptMarkdown(makeVersion(), 'a@b.c', null, []))).toContain('tags: []');
    expect(frontmatter(buildPromptMarkdown(makeVersion(), 'a@b.c', null, null))).toContain('tags: []');
    expect(frontmatter(buildPromptMarkdown(makeVersion(), 'a@b.c'))).toContain('tags: []');
  });

  it('omits the Changelog section when changelog_note is empty/whitespace', () => {
    expect(buildPromptMarkdown(makeVersion({ changelog_note: '   ' }), 'a@b.c')).not.toContain(
      '## Changelog',
    );
  });

  it('includes the Changelog section when changelog_note is present', () => {
    const md = buildPromptMarkdown(makeVersion({ changelog_note: 'Tightened wording' }), 'a@b.c');
    expect(md).toContain('## Changelog\n\n- v3: Tightened wording');
  });

  it('formats a string created_at and falls back to empty on an unparseable value', () => {
    expect(
      frontmatter(
        buildPromptMarkdown(
          makeVersion({ created_at: '2026-01-05T00:00:00Z' as unknown as Date }),
          'a@b.c',
        ),
      ),
    ).toContain('created: "2026-01-05"');
    expect(
      frontmatter(
        buildPromptMarkdown(makeVersion({ created_at: 'not-a-date' as unknown as Date }), 'a@b.c'),
      ),
    ).toContain('created: ""');
  });

  it('defaults author to "unknown" when null', () => {
    expect(frontmatter(buildPromptMarkdown(makeVersion(), null))).toContain('author: "unknown"');
  });
});
