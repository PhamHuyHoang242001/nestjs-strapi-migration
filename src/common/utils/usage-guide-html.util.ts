// Namespace import: sanitize-html is CommonJS and esModuleInterop is off in this project,
// so a default import resolves to undefined at runtime.
import * as sanitizeHtml from 'sanitize-html';
import { STRAPI_UPLOAD_URL } from '@configuration/env.config';

// Hard ceiling on stored guide HTML. Large enough for a long illustrated document, small enough
// that a single row can never dominate a response or a table scan. Applied after sanitizing so
// the budget covers what is actually persisted, not what the client sent.
export const USAGE_GUIDE_MAX_LENGTH = 200_000;

// Formatting the editor can produce. Everything outside this list — script, style, iframe, form,
// event handlers, inline styles — is dropped rather than escaped, so stored HTML is renderable.
const ALLOWED_TAGS = [
  'p',
  'h1',
  'h2',
  'h3',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'a',
  'blockquote',
  'code',
  'pre',
  'img',
  'br',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'colgroup',
  'col',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href'],
  img: ['src', 'alt'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  col: ['span'],
  ol: ['start', 'class'],
  li: ['class'],
};

// Only these link schemes survive; `javascript:` and `data:` are absent by construction.
const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

// Images must come from the configured Strapi host — the same origin rule the avatar URL obeys.
// A guide may only reference media this system uploaded, so a foreign or data: src cannot be
// used to beacon readers or smuggle a payload past the tag allowlist.
function isStrapiImageSrc(src: string): boolean {
  try {
    const base = new URL(STRAPI_UPLOAD_URL);
    // Relative srcs resolve against Strapi and therefore pass; absolute foreign ones do not.
    return new URL(src, STRAPI_UPLOAD_URL).origin === base.origin;
  } catch {
    return false;
  }
}

// Sanitize editor HTML for storage. Returns the cleaned string; never throws on malformed markup.
export function sanitizeUsageGuideHtml(html: string): string {
  if (!html) return '';

  const cleaned = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    // Disallowed tags vanish entirely, contents included — a stripped <script> must not leave
    // its body behind as visible text.
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'style', 'textarea', 'noscript'],
    transformTags: {
      // Drop an image whose src is not Strapi by rewriting it to a tag that is then discarded.
      img: (tagName, attribs) =>
        isStrapiImageSrc(attribs.src ?? '') ? { tagName, attribs } : { tagName: 'span', attribs: {}, text: '' },
    },
    // The rewritten placeholder is not in allowedTags, so it is discarded on the same pass.
  });

  return cleaned.length > USAGE_GUIDE_MAX_LENGTH ? cleaned.slice(0, USAGE_GUIDE_MAX_LENGTH) : cleaned;
}

// A guide counts as empty when it carries neither visible text nor an image. Whitespace-only
// markup from the editor ('<p>  </p>', '<p><br></p>') is empty; a lone illustration is not.
export function isUsageGuideEmpty(html: string): boolean {
  if (!html) return true;
  if (/<img\b/i.test(html)) return false;
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  return text.replace(/&nbsp;/gi, ' ').trim().length === 0;
}
