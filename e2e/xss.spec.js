import { test, expect } from '@playwright/test';

// Tier-2 (T0-3): render attacker-controlled item content through the REAL app
// modules in a real browser and prove the stored-XSS fixes hold — no script
// executes, link hrefs are sanitized, and unsafe image src is dropped.
test('malicious item content does not execute on render', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#canvas');

  await page.evaluate(async () => {
    window.__xss = false;
    const mod = await import('/js/items.js');
    // memo containing an event-handler image (sanitized on the load boundary)
    mod.createItem({ type: 'memo', x: 100, y: 100, w: 220, h: 120,
      content: '<img src="x" onerror="window.__xss = true">' }, true);
    // image item with attribute-injection content (must not become onerror=)
    mod.createItem({ type: 'image', x: 100, y: 260, w: 220, h: 120,
      content: 'x" onerror="window.__xss = true' }, true);
    // link with a javascript: URL (must be sanitized away)
    mod.createItem({ type: 'link', x: 100, y: 420, w: 220, h: 120,
      content: { url: 'javascript:window.__xss = true', title: 't', display: 'd' } }, true);
  });

  // Allow any failed-image error events / async handlers a chance to fire.
  await page.waitForTimeout(300);

  // 1) No injected handler ran.
  expect(await page.evaluate(() => window.__xss)).toBe(false);

  // 2) No element carries an inline onerror/on* handler.
  const onerrorAttrs = await page.$$eval('img', els => els.map(e => e.getAttribute('onerror')));
  for (const v of onerrorAttrs) expect(v).toBeNull();

  // 3) Link href is sanitized (no javascript: scheme) and hardened with rel.
  const links = await page.$$eval('a.link-url', els =>
    els.map(e => ({ href: e.getAttribute('href') || '', rel: e.getAttribute('rel') || '' })));
  expect(links.length).toBeGreaterThan(0);
  for (const l of links) {
    expect(l.href.toLowerCase()).not.toContain('javascript:');
    expect(l.rel).toContain('noopener');
  }

  // 4) The injected image item has no unsafe src set.
  const imgSrcs = await page.$$eval('img.item-image', els => els.map(e => e.getAttribute('src') || ''));
  for (const s of imgSrcs) expect(s.toLowerCase()).not.toContain('onerror');
});
