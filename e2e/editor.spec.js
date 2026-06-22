import { test, expect } from '@playwright/test';

async function openCleanApp(page) {
  await page.goto('/');
  await page.waitForSelector('#canvas');
  await page.waitForLoadState('networkidle');
}

test('memo undo/redo stays in the editor and preserves unrelated canvas nodes', async ({ page }) => {
  await openCleanApp(page);

  await page.evaluate(async () => {
    const items = await import('/js/items.js');
    const ui = await import('/js/ui.js');

    items.createItem({ type: 'memo', x: 60, y: 60, w: 220, h: 140, content: 'A' });
    ui.saveState();
    items.createItem({ type: 'keyword', x: 360, y: 60, w: 256, h: 80, content: 'Unrelated' });
    ui.saveState();
  });

  const memo = page.locator('.memo-body');
  await expect(memo).toHaveCount(1);
  await memo.click();
  await memo.press('End');
  await memo.type('B');
  await expect(memo).toHaveText('AB');

  await memo.press('Control+z');
  await expect(memo).toHaveText('A');
  await expect(page.locator('#canvas .canvas-item')).toHaveCount(2);
  await expect(memo).toBeFocused();

  await memo.press('Control+Shift+z');
  await expect(memo).toHaveText('AB');
  await expect(page.locator('#canvas .canvas-item')).toHaveCount(2);

  const contentState = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const editor = document.querySelector('.memo-body');
    const memoItem = state.items.find(item => item.type === 'memo');
    return { dom: editor.innerHTML, model: memoItem.content };
  });
  expect(contentState.model).toBe(contentState.dom);
});

test('canvas Ctrl+Shift+Z still redoes when focus is outside an editor', async ({ page }) => {
  await openCleanApp(page);

  await page.evaluate(async () => {
    const items = await import('/js/items.js');
    const ui = await import('/js/ui.js');

    items.createItem({ type: 'memo', x: 60, y: 60, w: 220, h: 140, content: 'A' });
    ui.saveState();
    items.createItem({ type: 'memo', x: 360, y: 60, w: 220, h: 140, content: 'B' });
    ui.saveState();
    ui.undo();
    document.body.focus();
  });

  await expect(page.locator('#canvas .canvas-item')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#canvas .canvas-item')).toHaveCount(2);
});

test('live memo DOM and model stay equal, then canonicalize together on blur', async ({ page }) => {
  await openCleanApp(page);

  await page.evaluate(async () => {
    const items = await import('/js/items.js');
    const ui = await import('/js/ui.js');
    items.createItem({ type: 'memo', x: 60, y: 60, w: 220, h: 140, content: '' });
    ui.saveState();
  });

  const memo = page.locator('.memo-body');
  await expect(memo).toHaveCount(1);
  await memo.click();
  await memo.type('alpha');
  await memo.press('Shift+Enter');
  await memo.type('beta');

  const liveState = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const editor = document.querySelector('.memo-body');
    return { dom: editor.innerHTML, model: state.items[0].content };
  });
  expect(liveState.model).toBe(liveState.dom);

  await page.locator('#topbar').click({ position: { x: 10, y: 10 } });

  const committedState = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const editor = document.querySelector('.memo-body');
    return { dom: editor.innerHTML, model: state.items[0].content };
  });
  expect(committedState.model).toBe(committedState.dom);
  expect(committedState.dom).not.toContain('\u200B');

  await page.waitForTimeout(1700);
  const committedHtml = committedState.dom;
  await page.reload();
  await page.waitForSelector('.memo-body');
  await expect(page.locator('.memo-body')).toHaveCount(1);
  expect(await page.locator('.memo-body').evaluate(editor => editor.innerHTML)).toBe(committedHtml);
});
