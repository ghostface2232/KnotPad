import { describe, it, expect } from 'vitest';
import { sanitizeUrl, sanitizeMemoHtml } from '../js/utils.js';

// T0-1: sanitizeUrl() — only http/https pass; bare URLs upgrade to https;
// every other scheme is rejected (stored-XSS defense for link hrefs).
describe('sanitizeUrl', () => {
  it('rejects dangerous schemes', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('JavaScript:alert(1)')).toBe(''); // case-insensitive
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeUrl('  javascript:alert(1)  ')).toBe(''); // trimmed then rejected
  });

  it('rejects non-http(s) schemes without upgrading them', () => {
    expect(sanitizeUrl('ftp://example.com')).toBe('');
    expect(sanitizeUrl('mailto:a@b.com')).toBe('');
  });

  it('preserves valid http/https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
    expect(sanitizeUrl('http://foo.com/bar?x=1')).toBe('http://foo.com/bar?x=1');
    expect(sanitizeUrl('HTTPS://EX.COM')).toBe('https://ex.com/');
  });

  it('upgrades bare URLs to https', () => {
    expect(sanitizeUrl('example.com')).toBe('https://example.com/');
    expect(sanitizeUrl('  example.com/path  ')).toBe('https://example.com/path');
  });

  it('returns empty for falsy / invalid input', () => {
    expect(sanitizeUrl('')).toBe('');
    expect(sanitizeUrl(null)).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
  });
});

// T0-2: sanitizeMemoHtml() — strip dangerous tags/handlers/URLs on the
// load/import boundary while preserving legacy memo structure & styling.
describe('sanitizeMemoHtml', () => {
  it('strips on* event-handler attributes but keeps the element', () => {
    const out = sanitizeMemoHtml('<img src="x" onerror="window.__xss=1">');
    expect(out).toMatch(/<img/i);
    expect(out).not.toMatch(/onerror/i);
  });

  it('removes dangerous tags entirely', () => {
    expect(sanitizeMemoHtml('<script>alert(1)</script>')).not.toMatch(/script/i);
    expect(sanitizeMemoHtml('<svg onload="alert(1)"></svg>')).not.toMatch(/svg/i);
    expect(sanitizeMemoHtml('<iframe src="evil"></iframe>')).not.toMatch(/iframe/i);
    expect(sanitizeMemoHtml('<button onclick="x()">b</button>')).not.toMatch(/button/i);
  });

  it('removes foreign-namespace tags and their nested scripts (case-insensitive)', () => {
    // SVG/MathML elements report lowercase tagName — must still be stripped.
    expect(sanitizeMemoHtml('<svg><script>alert(1)</script></svg>')).not.toMatch(/svg|script/i);
    expect(sanitizeMemoHtml('<math><mtext></mtext></math>')).not.toMatch(/math/i);
  });

  it('removes href/src with unsafe schemes', () => {
    const a = sanitizeMemoHtml('<a href="javascript:alert(1)">x</a>');
    expect(a).toMatch(/<a/i);
    expect(a).not.toMatch(/javascript:/i);
  });

  it('strips styles carrying script vectors', () => {
    const out = sanitizeMemoHtml('<div style="background:url(javascript:alert(1))">x</div>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it('preserves benign legacy memo structure and styling', () => {
    const legacy = '<div class="text-align-center"><h1>Title</h1><p>safe <strong>bold</strong> <em>i</em></p><ul><li>a</li></ul></div>';
    const out = sanitizeMemoHtml(legacy);
    expect(out).toMatch(/<h1>Title<\/h1>/);
    expect(out).toMatch(/<strong>bold<\/strong>/);
    expect(out).toMatch(/text-align-center/);
    expect(out).toMatch(/<li>a<\/li>/);
  });

  it('keeps safe href and data:image src', () => {
    expect(sanitizeMemoHtml('<a href="https://ok.com">x</a>')).toMatch(/href="https:\/\/ok\.com"/);
    expect(sanitizeMemoHtml('<img src="data:image/png;base64,AAAA">')).toMatch(/data:image\/png/);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeMemoHtml('')).toBe('');
  });
});
