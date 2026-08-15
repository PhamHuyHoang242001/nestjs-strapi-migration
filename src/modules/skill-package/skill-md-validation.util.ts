// Validates that an extracted `skill.md` conforms to the Agent Skills open standard
// (agentskills.io/specification) plus the Claude Skills API requirements, so an uploaded
// skill package is well-formed before it is ever persisted or reviewed.
//
// Enforced rules (all hard 422 rejections — mirrors the spec's `skills-ref validate` tool):
//  - Body length cap (progressive-disclosure hygiene; keeps SKILL.md small)
//  - YAML frontmatter present (delimited by `---` fences at the very top)
//  - `name`   : required, 1-64 chars, lowercase alnum + single hyphens, no leading/
//               trailing/consecutive hyphen, not a reserved vendor word
//  - `description`: required, 1-1024 chars, non-empty
import { UnprocessableEntityException } from '@nestjs/common';

// Spec recommends "keep SKILL.md under 500 lines"; enforced here as a hard cap.
export const MAX_SKILL_MD_LINES = 500;
// Frontmatter field limits from the Agent Skills spec / Claude Skills API.
export const NAME_MAX_LENGTH = 64;
export const DESCRIPTION_MAX_LENGTH = 1024;
// The Skills API rejects a name equal to a reserved vendor word.
export const RESERVED_NAME_WORDS = ['anthropic', 'claude'];
// Lowercase alphanumeric segments joined by single hyphens — this single pattern
// simultaneously forbids uppercase, leading/trailing hyphens, and consecutive hyphens.
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate the text content of a `skill.md`. Throws 422 on the first violation.
 * Order is cheapest-first (line count) then structural (frontmatter) then field-level.
 */
export function validateSkillMd(content: string): void {
  assertLineCount(content);

  const frontmatter = extractFrontmatter(content);
  if (frontmatter === null) {
    throw new UnprocessableEntityException(
      'SKILL_MD_NO_FRONTMATTER: skill.md must start with YAML frontmatter delimited by "---" fences',
    );
  }

  const fields = parseTopLevelScalars(frontmatter);
  assertName(fields.name);
  assertDescription(fields.description);
}

// --- Individual guards --------------------------------------------------------

function assertLineCount(content: string): void {
  // Normalize line endings and ignore a single trailing newline so a file of exactly
  // N content lines counts as N regardless of whether it ends with a newline.
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  const lineCount = body === '' ? 0 : body.split('\n').length;
  if (lineCount > MAX_SKILL_MD_LINES) {
    throw new UnprocessableEntityException(
      `SKILL_MD_TOO_LONG: skill.md has ${lineCount} lines (max ${MAX_SKILL_MD_LINES})`,
    );
  }
}

function assertName(name: string | undefined): void {
  if (!name) {
    throw new UnprocessableEntityException(
      'SKILL_MD_NAME_MISSING: skill.md frontmatter must define a non-empty "name"',
    );
  }
  if (name.length > NAME_MAX_LENGTH) {
    throw new UnprocessableEntityException(
      `SKILL_MD_NAME_TOO_LONG: "name" is ${name.length} chars (max ${NAME_MAX_LENGTH})`,
    );
  }
  if (!NAME_PATTERN.test(name)) {
    throw new UnprocessableEntityException(
      `SKILL_MD_NAME_INVALID: "name" must be lowercase alphanumeric with single hyphens ` +
        `(no leading, trailing, or consecutive hyphens): got "${name}"`,
    );
  }
  if (RESERVED_NAME_WORDS.includes(name.toLowerCase())) {
    throw new UnprocessableEntityException(
      `SKILL_MD_NAME_RESERVED: "name" must not be a reserved word (${RESERVED_NAME_WORDS.join(', ')})`,
    );
  }
}

function assertDescription(description: string | undefined): void {
  if (!description) {
    throw new UnprocessableEntityException(
      'SKILL_MD_DESCRIPTION_MISSING: skill.md frontmatter must define a non-empty "description"',
    );
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    throw new UnprocessableEntityException(
      `SKILL_MD_DESCRIPTION_TOO_LONG: "description" is ${description.length} chars (max ${DESCRIPTION_MAX_LENGTH})`,
    );
  }
}

// --- Frontmatter parsing (dependency-free) ------------------------------------

/**
 * Return the raw text between the leading `---` fences, or null when the content
 * does not open with a frontmatter block. A leading UTF-8 BOM is tolerated.
 */
function extractFrontmatter(content: string): string | null {
  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const match = withoutBom.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  return match ? match[1] : null;
}

/**
 * Extract top-level scalar keys (no indentation) from a YAML frontmatter block.
 * Only the scalar fields this validator needs are read; nested maps (e.g. `metadata:`)
 * and their indented children are ignored. First occurrence of a key wins.
 *
 * Block scalars (`key: >` or `key: |`, optionally with chomping/indent indicators) are
 * supported: the value is gathered from the following more-indented lines, so a multi-line
 * description is measured against the length cap on its real content rather than "|"/">"
 * being mistaken for a 1-char value.
 */
function parseTopLevelScalars(block: string): { name?: string; description?: string } {
  const fields: { name?: string; description?: string } = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    // Only unindented `key: value` lines are top-level scalars.
    const match = lines[i].match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (key !== 'name' && key !== 'description') continue;
    if (fields[key] !== undefined) continue;

    const inline = match[2].trim();
    if (/^[|>][0-9+-]*$/.test(inline)) {
      // Block scalar: consume subsequent indented (or blank) lines until a column-0 dedent.
      const collected: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() === '') {
          collected.push('');
        } else if (/^[ \t]/.test(lines[j])) {
          collected.push(lines[j].trim());
        } else {
          break;
        }
      }
      fields[key] = collected.join('\n').trim();
      i = j - 1;
    } else {
      fields[key] = normalizeScalar(match[2]);
    }
  }
  return fields;
}

/** Trim a scalar value, unwrapping matching quotes or stripping a trailing inline comment. */
function normalizeScalar(raw: string): string {
  const value = raw.trim();
  const isQuoted =
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
  if (isQuoted) return value.slice(1, -1);
  // Unquoted scalar: a ` #` sequence starts a YAML inline comment.
  const commentAt = value.indexOf(' #');
  return commentAt === -1 ? value : value.slice(0, commentAt).trim();
}
