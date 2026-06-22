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
  expect(liveState.dom).not.toContain('\u200B');

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

test('IME composition commits once at completion and defers a composing blur', async ({ page }) => {
  await openCleanApp(page);

  await page.evaluate(async () => {
    const items = await import('/js/items.js');
    items.createItem({ type: 'memo', x: 60, y: 60, w: 220, h: 140, content: '' });
    items.createItem({ type: 'memo', x: 360, y: 60, w: 220, h: 140, content: '' });
  });

  const duringComposition = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const { default: eventBus, Events } = await import('/js/events-bus.js');
    const [first, second] = document.querySelectorAll('.memo-body');
    let stateSaveCount = 0;
    let autosaveCount = 0;
    const stopStateCount = eventBus.on(Events.STATE_SAVE, () => stateSaveCount++);
    const stopAutosaveCount = eventBus.on(Events.AUTOSAVE_TRIGGER, () => autosaveCount++);
    first.focus();
    first.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    first.textContent = 'ㅎ';
    first.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      data: 'ㅎ',
      isComposing: true,
    }));
    first.textContent = '한';
    first.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      data: '한',
      isComposing: true,
    }));

    const modelWhileComposing = state.items[0].content;
    const eventsWhileComposing = { stateSaveCount, autosaveCount };
    second.focus();
    const modelAfterBlur = state.items[0].content;
    const eventsAfterBlur = { stateSaveCount, autosaveCount };
    first.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한' }));
    first.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: '한',
    }));
    await new Promise(resolve => setTimeout(resolve, 75));
    stopStateCount();
    stopAutosaveCount();

    return {
      modelWhileComposing,
      modelAfterBlur,
      eventsWhileComposing,
      eventsAfterBlur,
      finalEventCounts: { stateSaveCount, autosaveCount },
      finalModel: state.items[0].content,
      finalDom: first.innerHTML,
    };
  });

  expect(duringComposition.modelWhileComposing).toBe('');
  expect(duringComposition.modelAfterBlur).toBe('');
  expect(duringComposition.eventsWhileComposing).toEqual({ stateSaveCount: 0, autosaveCount: 0 });
  expect(duringComposition.eventsAfterBlur).toEqual({ stateSaveCount: 0, autosaveCount: 0 });
  expect(duringComposition.finalEventCounts).toEqual({ stateSaveCount: 1, autosaveCount: 1 });
  expect(duringComposition.finalModel).toBe(duringComposition.finalDom);
  expect(duringComposition.finalDom).toContain('한');
});

test('legacy IME keyCode 229 does not turn candidate Enter into a paragraph', async ({ page }) => {
  await openCleanApp(page);
  const result = await page.evaluate(async () => {
    const items = await import('/js/items.js');
    items.createItem({ type: 'memo', x: 60, y: 60, w: 220, h: 140, content: '한' });
    const editor = document.querySelector('.memo-body');
    editor.focus();
    const beforeHtml = editor.innerHTML;
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      keyCode: 229,
      which: 229,
      bubbles: true,
      cancelable: true,
    });
    const dispatched = editor.dispatchEvent(event);
    const paragraphEvent = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertParagraph',
    });
    const paragraphDispatched = editor.dispatchEvent(paragraphEvent);
    return { dispatched, paragraphDispatched, beforeHtml, afterHtml: editor.innerHTML };
  });

  expect(result.dispatched).toBe(true);
  expect(result.paragraphDispatched).toBe(false);
  expect(result.afterHtml).toBe(result.beforeHtml);
});

test('canvas switch waits for IME completion before saving and removing the editor', async ({ page }) => {
  await openCleanApp(page);

  const result = await page.evaluate(async () => {
    const items = await import('/js/items.js');
    const ui = await import('/js/ui.js');
    const state = await import('/js/state.js');
    items.createItem({ type: 'memo', x: 60, y: 60, w: 220, h: 140, content: '' });

    const oldCanvasId = state.currentCanvasId;
    const editor = document.querySelector('.memo-body');
    editor.focus();
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.textContent = '전환';
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      data: '전환',
      isComposing: true,
    }));

    let switchCompleted = false;
    const switching = ui.createNewCanvas().then(() => {
      switchCompleted = true;
    });
    await Promise.resolve();
    const stayedOnOldCanvas = state.currentCanvasId === oldCanvasId && editor.isConnected;
    const switchCompletedBeforeCompositionEnd = switchCompleted;

    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '전환' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: '전환',
    }));
    await switching;

    const saved = JSON.parse(localStorage.getItem('knotpad-data-' + oldCanvasId));
    return {
      stayedOnOldCanvas,
      switchCompletedBeforeCompositionEnd,
      switchedAway: state.currentCanvasId !== oldCanvasId,
      savedContent: saved.items[0].content,
    };
  });

  expect(result.stayedOnOldCanvas).toBe(true);
  expect(result.switchCompletedBeforeCompositionEnd).toBe(false);
  expect(result.switchedAway).toBe(true);
  expect(result.savedContent).toContain('전환');
});

test('canvas switch has a bounded fallback when blur omits compositionend', async ({ page }) => {
  await openCleanApp(page);

  const result = await page.evaluate(async () => {
    const items = await import('/js/items.js');
    const ui = await import('/js/ui.js');
    const state = await import('/js/state.js');
    items.createItem({ type: 'memo', x: 60, y: 60, w: 220, h: 140, content: '' });

    const oldCanvasId = state.currentCanvasId;
    const editor = document.querySelector('.memo-body');
    editor.focus();
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.textContent = 'fallback';
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      data: 'fallback',
      isComposing: true,
    }));

    const startedAt = performance.now();
    await ui.createNewCanvas();
    const elapsed = performance.now() - startedAt;
    const saved = JSON.parse(localStorage.getItem('knotpad-data-' + oldCanvasId));
    return {
      elapsed,
      switchedAway: state.currentCanvasId !== oldCanvasId,
      savedContent: saved.items[0].content,
    };
  });

  expect(result.elapsed).toBeLessThan(1000);
  expect(result.switchedAway).toBe(true);
  expect(result.savedContent).toContain('fallback');
});

test('beforeunload synchronously preserves an active composition DOM', async ({ page }) => {
  await openCleanApp(page);

  const savedContent = await page.evaluate(async () => {
    const items = await import('/js/items.js');
    const state = await import('/js/state.js');
    items.createItem({ type: 'memo', x: 60, y: 60, w: 220, h: 140, content: '' });
    const editor = document.querySelector('.memo-body');
    editor.focus();
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.textContent = '종료';
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      data: '종료',
      isComposing: true,
    }));

    window.dispatchEvent(new Event('beforeunload'));
    const saved = JSON.parse(localStorage.getItem('knotpad-data-' + state.currentCanvasId));
    return saved.items[0].content;
  });

  expect(savedContent).toContain('종료');
});

test('handled editor paste never bubbles into canvas paste routing', async ({ page }) => {
  await openCleanApp(page);

  const result = await page.evaluate(async () => {
    const items = await import('/js/items.js');
    const state = await import('/js/state.js');
    items.createItem({ type: 'memo', x: 60, y: 60, w: 220, h: 140, content: '' });

    const editor = document.querySelector('.memo-body');
    editor.focus();
    let reachedWindow = false;
    window.addEventListener('paste', () => {
      reachedWindow = true;
    }, { once: true });

    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'editor-only');
    editor.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData,
    }));

    return {
      reachedWindow,
      itemCount: state.items.length,
      editorText: editor.textContent,
    };
  });

  expect(result.reachedWindow).toBe(false);
  expect(result.itemCount).toBe(1);
  expect(result.editorText).toBe('editor-only');
});

test('canvas paste routing ignores events already handled by another component', async ({ page }) => {
  await openCleanApp(page);

  const itemCount = await page.evaluate(async () => {
    const state = await import('/js/state.js');
    const canvas = document.querySelector('#canvas');
    canvas.addEventListener('paste', event => event.preventDefault(), { once: true });

    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'must-not-create-a-node');
    canvas.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData,
    }));
    return state.items.length;
  });

  expect(itemCount).toBe(0);
});
