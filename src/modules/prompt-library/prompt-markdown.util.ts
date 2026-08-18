import { PromptVersion } from '@modules/databases/prompt-version.entity';

// Build a professional, international-standard Markdown export of a prompt version:
// a YAML frontmatter block (machine-readable metadata, as recognised by Obsidian / Jekyll /
// GitHub) followed by human-readable sections. The prompt body is embedded verbatim so it
// renders as prose. Pure function — no I/O — so it is directly unit-testable.

// Escape a value for use as a double-quoted YAML scalar: backslash and quote are escaped and
// any newline is flattened to a space (frontmatter scalars are single-line). Guards against a
// user-supplied title/category/tag breaking out of the frontmatter block (YAML injection).
function yamlString(value: string | null | undefined): string {
  const escaped = (value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ');
  return `"${escaped}"`;
}

// Serialize a tag list as a YAML flow array: ["a", "b"]. Non-array or empty input -> [].
function yamlTags(tags: unknown): string {
  if (!Array.isArray(tags) || tags.length === 0) return '[]';
  return `[${tags.map((t) => yamlString(String(t))).join(', ')}]`;
}

// Format a date-ish value to YYYY-MM-DD; returns '' when absent or unparseable.
function isoDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function buildPromptMarkdown(
  version: PromptVersion,
  authorEmail: string | null,
  categoryName?: string | null,
): string {
  const created = isoDate(version.created_at);

  const lines: string[] = [
    '---',
    `title: ${yamlString(version.name)}`,
    `category: ${yamlString(categoryName)}`,
    `version: ${version.version_no}`,
    `author: ${yamlString(authorEmail ?? 'unknown')}`,
    `created: ${yamlString(created)}`,
    `tags: ${yamlTags(version.tags)}`,
    '---',
    '',
    `# ${version.name}`,
    '',
    `> ${version.short_description}`,
    '',
    '## Overview',
    '',
    version.short_description,
    '',
    '## Prompt',
    '',
    version.prompt_content,
    '',
  ];

  // Changelog is optional — only present it when the version carries a non-empty note.
  const changelog = (version.changelog_note ?? '').trim();
  if (changelog) {
    lines.push('## Changelog', '', `- v${version.version_no}: ${changelog}`, '');
  }

  lines.push(
    '## Usage Notes',
    '',
    'Paste the prompt above into your LLM of choice. Replace any {{placeholders}} before use.',
    '',
  );

  return lines.join('\n');
}
