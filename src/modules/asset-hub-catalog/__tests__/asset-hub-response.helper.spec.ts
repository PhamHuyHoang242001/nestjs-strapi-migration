import { stripGuide } from '../asset-hub-response.helper';

describe('stripGuide', () => {
  it('returns null/undefined unchanged', () => {
    expect(stripGuide(null)).toBeNull();
    expect(stripGuide(undefined)).toBeUndefined();
  });

  it('drops usage_guide_html and zip_tree, keeps other keys', () => {
    const out = stripGuide({
      id: 7,
      usage_guide_html: '<p>x</p>',
      zip_tree: [{ path: 'skill.md', isDir: false, size: 1 }],
      name: 'A',
    });
    expect(out).toEqual({ id: 7, name: 'A' });
    expect(out).not.toHaveProperty('usage_guide_html');
    expect(out).not.toHaveProperty('zip_tree');
  });

  it('is a no-op on extra-field-free prompt-shaped rows', () => {
    expect(stripGuide({ id: 1, name: 'p' } as { usage_guide_html?: string; id: number; name: string })).toEqual({
      id: 1,
      name: 'p',
    });
  });
});
