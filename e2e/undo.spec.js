import { test, expect } from '@playwright/test';

// Tier-2 (T1-1): delete -> undo through the REAL app wiring (eventBus
// STATE_SAVE -> saveState) and real DOM rebuild (restoreState). Validates the
// snapshot-after model: a deletion is recorded so undo restores it exactly.
// A fresh Playwright profile means empty localStorage -> clean default canvas.
test('multi-delete then undo restores the item (snapshot-after)', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#canvas');
  await page.waitForLoadState('networkidle'); // let app init wire the event bus

  const counts = await page.evaluate(async () => {
    const items = await import('/js/items.js');
    const ui = await import('/js/ui.js');
    const state = await import('/js/state.js');

    const a = items.createItem({ type: 'memo', x: 60, y: 60, w: 180, h: 80, content: 'A' });
    ui.saveState(); // record the post-add state on the undo stack
    const before = state.items.length;

    state.selectedItems.clear();
    state.selectedItems.add(a);
    items.deleteSelectedItems(); // emits STATE_SAVE after deletion
    const afterDelete = state.items.length;

    ui.undo();
    const afterUndo = state.items.length;

    return { before, afterDelete, afterUndo };
  });

  expect(counts.before).toBe(1);
  expect(counts.afterDelete).toBe(0);
  expect(counts.afterUndo).toBe(1); // restored, not lost or resurrected-wrong

  // The restored item is actually present in the DOM (restoreState rebuilt it).
  await expect(page.locator('#canvas .canvas-item')).toHaveCount(1);
});
