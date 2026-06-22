import { test, expect } from '@playwright/test';

test('P2 canvas hot paths reuse work and DOM without changing output', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#canvas');

  const result = await page.evaluate(async () => {
    const items = await import('/js/items.js');
    const connections = await import('/js/connections.js');
    const ui = await import('/js/ui.js');
    const state = await import('/js/state.js');

    const a = items.createItem({ type: 'memo', x: 40, y: 40, w: 180, h: 90, content: 'A' });
    const b = items.createItem({ type: 'memo', x: 360, y: 80, w: 180, h: 90, content: 'B' });
    const c = items.createItem({ type: 'memo', x: 680, y: 120, w: 180, h: 90, content: 'C' });
    const ab = connections.addConnection(a, 'right', b, 'left', true);
    const bc = connections.addConnection(b, 'right', c, 'left', true);

    ab.dir = 'forward';
    connections.updateConnectionArrow(ab);
    const arrowBefore = ab.arrow;
    const polygonBefore = ab.arrow.querySelector('polygon');
    a.x += 20;
    connections.updateConnectionArrow(ab);

    ab.label = 'label';
    const expectedLabelPoint = ab.el.getPointAtLength(ab.el.getTotalLength() / 2);
    ab.el.getTotalLength = () => { throw new Error('layout API must not be called'); };
    connections.updateConnectionLabel(ab);
    const labelText = ab.labelEl.querySelector('text');
    const labelX = Number(labelText.getAttribute('x'));
    const labelY = Number(labelText.getAttribute('y'));

    const incidentToA = connections.getConnectionsForItems([a]);

    ui.updateMinimap('structure');
    const minimapItemBefore = document.querySelector('.minimap-item');
    const viewportBefore = document.querySelector('.minimap-viewport');
    const oldViewportLeft = viewportBefore.style.left;
    state.setOffsetX(state.offsetX + 120);
    ui.updateMinimap('viewport');

    state.setUndoStack([]);
    state.setRedoStack([]);
    ui.saveState();
    a.x += 1;
    const originalStringify = JSON.stringify;
    let stringifyCount = 0;
    JSON.stringify = (...args) => {
      stringifyCount += 1;
      return originalStringify(...args);
    };
    try {
      ui.saveState();
    } finally {
      JSON.stringify = originalStringify;
    }

    return {
      arrowReused: ab.arrow === arrowBefore,
      polygonReused: ab.arrow.querySelector('polygon') === polygonBefore,
      labelX,
      labelMidpointError: Math.hypot(labelX - expectedLabelPoint.x, labelY - expectedLabelPoint.y),
      incidentCount: incidentToA.length,
      incidentIsAB: incidentToA[0] === ab,
      unrelatedExcluded: !incidentToA.includes(bc),
      minimapItemReused: document.querySelector('.minimap-item') === minimapItemBefore,
      viewportReused: document.querySelector('.minimap-viewport') === viewportBefore,
      viewportMoved: viewportBefore.style.left !== oldViewportLeft,
      stringifyCount
    };
  });

  expect(result).toEqual({
    arrowReused: true,
    polygonReused: true,
    labelX: expect.any(Number),
    labelMidpointError: expect.any(Number),
    incidentCount: 1,
    incidentIsAB: true,
    unrelatedExcluded: true,
    minimapItemReused: true,
    viewportReused: true,
    viewportMoved: true,
    stringifyCount: 1
  });
  expect(Number.isFinite(result.labelX)).toBe(true);
  expect(result.labelMidpointError).toBeLessThan(0.5);
});
