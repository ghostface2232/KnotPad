import { describe, expect, it } from 'vitest';
import { getMemoHtmlFromClipboardData } from '../js/items.js';

function clipboardData(entries) {
  return {
    getData(type) {
      return entries[type] || '';
    },
  };
}

describe('internal memo clipboard sanitization', () => {
  it('sanitizes the custom MIME payload before normalization', () => {
    const html = getMemoHtmlFromClipboardData(clipboardData({
      'application/x-knotpad-memo': '<div data-knotpad-paragraph="true"><strong>safe</strong><img src="x" onerror="window.__xss=1"><script>window.__xss=2</script></div>',
    }));

    expect(html).toBe('<div data-knotpad-paragraph="true"><strong>safe</strong>window.__xss=2</div>');
    expect(html).not.toMatch(/<img|<script|onerror/i);
  });

  it('treats the HTML marker as a hint, not a trust boundary', () => {
    const html = getMemoHtmlFromClipboardData(clipboardData({
      'text/html': '<!--KNOTPAD_MEMO--><h1 onclick="window.__xss=1">Title</h1><iframe src="javascript:alert(1)">fallback</iframe>',
    }));

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('fallback');
    expect(html).not.toMatch(/onclick|iframe|javascript:/i);
  });
});
