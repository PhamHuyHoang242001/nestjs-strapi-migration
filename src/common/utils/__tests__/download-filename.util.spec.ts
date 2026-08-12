import { slugify, buildDownloadFilename } from '../download-filename.util';

describe('slugify', () => {
  it('kebab-cases and lowercases a plain name', () => {
    expect(slugify('Code Review Assistant')).toBe('code-review-assistant');
  });

  it('strips diacritics to ASCII', () => {
    expect(slugify('Café Ünïcode')).toBe('cafe-unicode');
  });

  it('collapses runs of non-alphanumerics and trims edge hyphens', () => {
    expect(slugify('  **Hello___World!!**  ')).toBe('hello-world');
  });

  it('returns empty string for empty / nullish input', () => {
    expect(slugify('')).toBe('');
    expect(slugify(null)).toBe('');
    expect(slugify(undefined)).toBe('');
  });

  it('returns empty string when the name has no alphanumerics', () => {
    expect(slugify('!!!___')).toBe('');
  });
});

describe('buildDownloadFilename', () => {
  it('builds "<slug>-v<n>.<ext>"', () => {
    expect(buildDownloadFilename('Code Review Assistant', 3, 'md', 'prompt')).toBe(
      'code-review-assistant-v3.md',
    );
  });

  it('uses the fallback when the slug is empty', () => {
    expect(buildDownloadFilename('!!!', 1, 'zip', 'skill')).toBe('skill-v1.zip');
    expect(buildDownloadFilename(null, 2, 'zip', 'skill')).toBe('skill-v2.zip');
  });
});
