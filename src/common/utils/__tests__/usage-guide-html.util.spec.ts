import { STRAPI_UPLOAD_URL } from '@configuration/env.config';
import { isUsageGuideEmpty, sanitizeUsageGuideHtml, USAGE_GUIDE_MAX_LENGTH } from '../usage-guide-html.util';

const strapiImg = `${STRAPI_UPLOAD_URL}/uploads/demo.gif`;

describe('sanitizeUsageGuideHtml', () => {
  it('keeps the formatting the editor produces', () => {
    const html =
      '<h2>Cách dùng</h2><p><strong>Bước 1</strong> — chạy <code>npm i</code></p><ul><li>một</li></ul><hr />';

    expect(sanitizeUsageGuideHtml(html)).toBe(html.replace('<hr />', '<hr />'));
  });

  it('drops script tags along with their contents', () => {
    const out = sanitizeUsageGuideHtml('<p>ok</p><script>alert(1)</script>');

    expect(out).toBe('<p>ok</p>');
    expect(out).not.toContain('alert');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeUsageGuideHtml('<p onclick="steal()">hi</p><img src="x" onerror="steal()" />');

    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onerror');
  });

  it('removes javascript: links but keeps the text', () => {
    const out = sanitizeUsageGuideHtml('<a href="javascript:alert(1)">click</a>');

    expect(out).not.toContain('javascript:');
    expect(out).toContain('click');
  });

  it('keeps an http(s) link', () => {
    expect(sanitizeUsageGuideHtml('<a href="https://example.com">docs</a>')).toContain('href="https://example.com"');
  });

  it('keeps an image served from the configured Strapi origin', () => {
    const out = sanitizeUsageGuideHtml(`<p><img src="${strapiImg}" alt="demo" /></p>`);

    expect(out).toContain(`src="${strapiImg}"`);
    expect(out).toContain('alt="demo"');
  });

  it('drops an image from any other origin', () => {
    const out = sanitizeUsageGuideHtml('<p><img src="https://evil.example.com/track.gif" /></p>');

    expect(out).not.toContain('evil.example.com');
    expect(out).not.toContain('<img');
  });

  it('drops a data-uri image', () => {
    const out = sanitizeUsageGuideHtml('<p><img src="data:image/gif;base64,R0lGOD" /></p>');

    expect(out).not.toContain('data:image');
    expect(out).not.toContain('<img');
  });

  it('drops disallowed structural tags', () => {
    const out = sanitizeUsageGuideHtml('<iframe src="https://x"></iframe><form><input /></form><p>keep</p>');

    expect(out).toBe('<p>keep</p>');
  });

  it('caps the stored length', () => {
    const out = sanitizeUsageGuideHtml(`<p>${'a'.repeat(USAGE_GUIDE_MAX_LENGTH + 500)}</p>`);

    expect(out.length).toBe(USAGE_GUIDE_MAX_LENGTH);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeUsageGuideHtml('')).toBe('');
  });

  it('keeps a numbered sequence list', () => {
    const html = '<h3>Sequence diagram</h3><ol start="1"><li>Upload</li><li>OCR</li></ol>';
    const out = sanitizeUsageGuideHtml(html);
    expect(out).toContain('<ol');
    expect(out).toContain('<li>');
    expect(out).toContain('OCR');
  });

  it('keeps a parameter/error table and colspan', () => {
    const html =
      '<table><thead><tr><th>Tên</th><th colspan="2">Mô tả</th></tr></thead><tbody><tr><td>id</td><td colspan="2">CIF</td></tr></tbody></table>';
    const out = sanitizeUsageGuideHtml(html);
    expect(out).toContain('<table>');
    expect(out).toContain('<th>');
    expect(out).toContain('colspan="2"');
    expect(out).toContain('CIF');
  });
});

describe('isUsageGuideEmpty', () => {
  it.each(['', '<p>  </p>', '<p><br /></p>', '<p>&nbsp;</p>', '<h1></h1>'])('treats %p as empty', (html) => {
    expect(isUsageGuideEmpty(html)).toBe(true);
  });

  it('treats text as non-empty', () => {
    expect(isUsageGuideEmpty('<p>xin chào</p>')).toBe(false);
  });

  it('treats an image-only guide as non-empty', () => {
    expect(isUsageGuideEmpty(`<p><img src="${strapiImg}" /></p>`)).toBe(false);
  });
});
