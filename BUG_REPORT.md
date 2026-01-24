# KnotPad Bug Report - Comprehensive Code Review

> **Analysis Date**: 2026-01-24
> **Reviewed By**: Claude Code AI
> **Codebase Version**: Commit 84a176f

This document identifies all bugs found during a comprehensive code review, prioritized by severity and criticality.

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 4 | Memory leaks, data corruption risks |
| **HIGH** | 6 | Race conditions, null reference errors, event listener leaks |
| **MEDIUM** | 7 | State synchronization issues, incomplete error handling |
| **LOW** | 5 | Edge cases, minor validation issues |

---

## CRITICAL BUGS (Severity: 1 - Immediate Fix Required)

### BUG-001: Memory Leak - Event Listeners Not Removed on Item Deletion

**Location**: `js/items.js:406-550` - `setupItemEvents()`

**Description**: When items are deleted via `deleteItem()`, the DOM element is removed but event listeners attached in `setupItemEvents()` are never removed. These listeners include:
- `mousedown` listener for dragging
- `click` listener for delete button
- `click` listeners for color picker options
- All memo toolbar button listeners
- `input`, `blur`, `focus` listeners on memo body
- `selectionchange` document listener (added on focus)

**Impact**: Memory accumulates with each deleted item. In long editing sessions, this causes increasing memory usage and eventual browser slowdown.

**Evidence**:
```javascript
// items.js:406 - Listeners added
function setupItemEvents(item) {
    const el = item.el;
    el.addEventListener('mousedown', e => { ... });
    // Many more listeners added...
}

// items.js:deleteItem() - Only removes DOM, not listeners
export function deleteItem(item, save = true) {
    // ...
    item.el.remove();  // Listeners are NOT removed!
}
```

**Fix Priority**: P0 - Must fix immediately

---

### BUG-002: Memory Leak - Media Error Handlers Never Unsubscribed

**Location**: `js/items.js:226-255` - `setupMediaErrorHandler()`

**Description**: The `handleError` callback is added as an event listener to media elements but never removed. When an item is deleted:
- The media element still has the listener attached
- The listener holds closures over `mediaElement` and `mediaId`
- No `removeEventListener` call exists

**Impact**: Memory leak grows with each image/video loaded and subsequently deleted.

**Evidence**:
```javascript
// items.js:249 - Listener added but never removed
mediaElement.addEventListener('error', handleError);
// No corresponding removeEventListener exists
```

**Fix Priority**: P0

---

### BUG-003: Race Condition - Auto-Save vs Manual Save Collision

**Location**: `js/ui.js:166-227` - `triggerAutoSave()` and `saveCurrentCanvas()`

**Description**: The auto-save timer and manual save can execute simultaneously:
1. `triggerAutoSave()` sets a 1-second timer that calls `saveState()`
2. `saveCurrentCanvas()` executes immediately without waiting for pending auto-saves
3. If both write to storage at the same time, data corruption can occur

**Impact**: Data corruption or lost updates in concurrent save operations.

**Evidence**:
```javascript
// ui.js - No coordination between these functions
export function triggerAutoSave() {
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    state.setAutoSaveTimer(setTimeout(() => {
        saveState();  // Writes to storage
    }, 1000));
}

export async function saveCurrentCanvas() {
    // No wait for autoSaveTimer
    await saveCanvases(...);  // Could race!
}
```

**Fix Priority**: P0

---

### BUG-004: Blob URL Leak - Failed Media Reload Leaves Orphaned URLs

**Location**: `js/items.js:180-223` - `reloadMediaSource()`

**Description**: When media reload fails after MAX_RETRIES, the function returns without revoking any previously created blob URL.

**Impact**: Memory leak - orphaned blob URLs accumulate for broken media files.

**Evidence**:
```javascript
// items.js:184-188
if (retryCount >= MAX_RETRIES) {
    console.warn(`Failed to reload media...`);
    return false;  // Exits without cleanup!
    // Old blob URL still in cache
}
```

**Fix Priority**: P1

---

## HIGH PRIORITY BUGS (Severity: 2)

### BUG-005: Null Reference - Unchecked URL Parsing in Link Creation

**Location**: `js/items.js:307-308` - `createItem()` for link type

**Description**: When creating a link item, `new URL(cfg.content.url)` is called without validation. If `cfg.content` or `cfg.content.url` is undefined or malformed, an exception is thrown.

**Impact**: App crashes if link item data is corrupted or partially loaded.

**Evidence**:
```javascript
// items.js:307-308
case 'link':
    html = `<img src="...?domain=${new URL(cfg.content.url).hostname}...">`;
    // No try-catch, no validation!
```

**Fix**: Wrap in try-catch or validate URL before parsing.

**Fix Priority**: P1

---

### BUG-006: Event Listener Accumulation in Color Picker

**Location**: `js/items.js:497-503` - Color option click handlers

**Description**: Color picker option click handlers are attached every time `setupItemEvents()` is called. If an item's event setup is re-triggered, listeners accumulate.

**Impact**: Multiple event listeners cause multiple simultaneous color changes, potential performance degradation.

**Fix Priority**: P2

---

### BUG-007: Search Results Reference Deleted Items

**Location**: `js/ui.js:102-125` - `closeSearch()` and `doSearch()`

**Description**: When items are deleted, `state.searchResults` may still reference them. If `highlightCurrentResult()` is called later, it attempts to access properties of deleted item objects.

**Impact**: Potential crashes or errors when navigating search results after deleting items.

**Evidence**:
```javascript
// ui.js:133-139
function highlightCurrentResult() {
    if (state.searchIndex >= 0 && state.searchResults[state.searchIndex]) {
        const item = state.searchResults[state.searchIndex];
        item.el.classList.add('search-highlight');  // item.el may be removed!
    }
}
```

**Fix Priority**: P2

---

### BUG-008: Import Clears State Before Validation

**Location**: `js/app.js:273-337` - Import canvas flow

**Description**: During import, the current state is cleared (connections removed, items removed) BEFORE the imported JSON is fully validated and parsed. If import fails partway through, the user loses their previous canvas state.

**Impact**: User gets mixed old/new data or loses canvas after failed import.

**Evidence**:
```javascript
// app.js:283-287 - State cleared before validation complete
state.connections.forEach(c => { c.el.remove(); ... });
state.connections.length = 0;
state.items.forEach(i => i.el.remove());
state.items.length = 0;
// THEN json is processed - if it fails, state is already gone
```

**Fix Priority**: P2

---

### BUG-009: Connection Label Elements Not Cleaned in switchCanvas

**Location**: `js/ui.js:499-502` - `switchCanvas()`

**Description**: When switching canvases, connection cleanup removes `c.el`, `c.hitArea`, and `c.arrow`, but `c.labelEl` is not removed.

**Impact**: Orphaned SVG label elements remain in the DOM.

**Evidence**:
```javascript
// ui.js:501 - labelEl missing from cleanup
state.connections.forEach(c => {
    c.el.remove();
    if (c.hitArea) c.hitArea.remove();
    if (c.arrow) c.arrow.remove();
    // Missing: if (c.labelEl) c.labelEl.remove();
});
```

**Fix Priority**: P2

---

### BUG-010: Undo/Redo Loses Per-Canvas History

**Location**: `js/ui.js:498-525` - `switchCanvas()`

**Description**: When switching canvases, undo/redo stacks are reset to empty or minimal state. Canvas-specific undo/redo history is lost.

**Impact**: Users lose ability to undo changes made before switching canvases.

**Fix Priority**: P2

---

## MEDIUM PRIORITY BUGS (Severity: 3)

### BUG-011: State Proxy Doesn't Trigger on Set/Map Direct Mutations

**Location**: `js/state.js:229-240` - `clearItemsAndConnections()`

**Description**: When `selectedItems.clear()` or `collapsedGroups.delete()` is called, the Proxy setter isn't triggered because these are method calls on the Set/Map, not property assignments.

**Impact**: Subscribers to STATE_CHANGED events don't get notified of selection changes, causing UI inconsistencies.

**Evidence**:
```javascript
// state.js:236
state.selectedItems.clear();  // Direct mutation - doesn't trigger proxy!
```

**Note**: Partial fix exists in `toggleGroupCollapsed()` which manually emits events, but not all mutations are covered.

**Fix Priority**: P3

---

### BUG-012: Document selectionchange Listener Persists After Memo Blur

**Location**: `js/items.js:813-825` - Memo selection handling

**Description**: The `selectionchange` listener is added to `document` on memo focus and should be removed on blur. However, if the blur handler doesn't execute (e.g., page navigation, rapid focus changes), the listener persists.

**Impact**: Accumulating document-level listeners, potential memory leak.

**Evidence**:
```javascript
// items.js:814-815
mb.addEventListener('focus', () => {
    document.addEventListener('selectionchange', handleSelectionChange);
});
// blur handler may not always fire
mb.addEventListener('blur', () => {
    document.removeEventListener('selectionchange', handleSelectionChange);
});
```

**Fix Priority**: P3

---

### BUG-013: Touch Event Panning Doesn't End Properly

**Location**: `js/events.js:278-314` - `setupTouchEvents()`

**Description**: The `touchend` handler only sets `isPanning` to false but doesn't clean up other pan-related state like `startX`, `startY`, or the `panning` class on the app element.

**Impact**: Potential UI inconsistency after touch interactions.

**Evidence**:
```javascript
// events.js:313
app.addEventListener('touchend', () => state.setIsPanning(false));
// Doesn't remove 'panning' class or reset other state
```

**Fix Priority**: P3

---

### BUG-014: Missing Error Handling in IndexedDB Operations

**Location**: `js/storage.js:36-60` - `saveMedia()`, `loadMedia()`, `deleteMedia()`

**Description**: IndexedDB transaction errors are not consistently handled. Some functions reject without error details, others silently resolve with null.

**Impact**: Difficult to debug storage failures, potential silent data loss.

**Fix Priority**: P3

---

### BUG-015: Minimap Update Function Can Be Uninitialized

**Location**: `js/viewport.js:163-170` - `updateMinimap()`

**Description**: `minimapUpdateFn` defaults to an empty function. If `setMinimapUpdateFn()` is never called (initialization order issue), minimap updates silently fail.

**Impact**: Minimap may not update in edge cases.

**Evidence**:
```javascript
// viewport.js:163
let minimapUpdateFn = () => {};  // No-op default
export function updateMinimap() {
    minimapUpdateFn();  // Silent failure if never set
}
```

**Fix Priority**: P3

---

### BUG-016: Color Display Mode Not Applied on Initial Load

**Location**: `js/app.js:371-372` - `init()`

**Description**: `applyColorDisplayMode()` is called during init, but it may execute before canvas items are loaded, resulting in the mode not being applied to existing items.

**Impact**: Items may not display with correct color mode until user changes it.

**Fix Priority**: P3

---

### BUG-017: Window Resize Not Handled for Viewport

**Location**: Not present in codebase

**Description**: There's no `resize` event listener to adjust viewport or minimap when the browser window is resized.

**Impact**: Minimap viewport indicator may become inaccurate after window resize.

**Fix Priority**: P3

---

## LOW PRIORITY BUGS (Severity: 4)

### BUG-018: Grid Snap Size Not Validated

**Location**: `js/events.js:158-161` - Grid snap calculation

**Description**: Grid snap uses `state.GRID_SIZE` without validation. If `GRID_SIZE` is 0, division by zero occurs.

**Impact**: Potential NaN values in item positioning (edge case).

**Evidence**:
```javascript
// events.js:159
newX = Math.round(newX / state.GRID_SIZE) * state.GRID_SIZE;
// No check if GRID_SIZE is valid
```

**Note**: Currently `GRID_SIZE` is a constant (16), so this is theoretical.

**Fix Priority**: P4

---

### BUG-019: Canvas Icon Letter Falls Back to 'U'

**Location**: `js/ui.js:660-663` - `getCanvasIconHTML()`

**Description**: Falls back to 'U' (for "Untitled") when canvas name is empty, but doesn't handle null/undefined names gracefully.

**Impact**: Minor - unlikely to occur.

**Fix Priority**: P4

---

### BUG-020: Export Doesn't Include manuallyResized Flag

**Location**: `js/app.js:214-237` - Export function

**Description**: The export function doesn't include the `manuallyResized` property for items, which is included in save operations.

**Impact**: Imported items may not preserve manual resize state.

**Evidence**:
```javascript
// app.js:214-227 - missing manuallyResized
items: state.items.map(i => ({
    id: i.id, type: i.type, x: i.x, y: i.y, w: i.w, h: i.h,
    content: i.content, color: i.color, fontSize: i.fontSize,
    textAlign: i.textAlign, locked: i.locked
    // Missing: manuallyResized
}))
```

**Fix Priority**: P4

---

### BUG-021: Duplicate Event Listeners on Reconnect Handler

**Location**: `js/app.js:396-406` - Storage reconnect handler

**Description**: If `tryRestoreFsConnection()` returns 'needs-permission' multiple times (e.g., during reinitialization), multiple `reconnectHandler` listeners could be added.

**Impact**: Minor - reconnect handler fires multiple times.

**Fix Priority**: P4

---

### BUG-022: Textarea Elements Not Considered in Keyboard Shortcuts

**Location**: `js/events.js:376-380` - Space key handler

**Description**: Space key handler checks for `input,textarea,[contenteditable="true"]` but the app doesn't use standard textareas. This is defensive coding but the selector could be simplified.

**Impact**: None (defensive code).

**Fix Priority**: P4

---

## Patterns from Previous Bug Fixes

Based on git history analysis of recent bug fixes:

| Commit | Bug Fixed | Pattern |
|--------|-----------|---------|
| c240639 | Link preview not loading on startup | Timing/initialization order |
| 6cac093 | textAlign and connection labels in undo/redo | State serialization incomplete |
| d2b8202 | Connection label elements on undo/redo | DOM cleanup incomplete |
| 21ad649 | Search showing HTML tags | Content sanitization |
| 2410b7a | Color filter transparency | CSS value handling |
| 8c65648 | Memo alignment sync save | State synchronization |
| 2ad8cb0 | Selection filtering bugs | Filter logic edge cases |

**Common Bug Patterns Identified**:
1. **Incomplete DOM cleanup** - Elements not removed when parent is deleted
2. **State serialization gaps** - Properties missing in save/restore
3. **Timing/initialization order** - Functions called before dependencies ready
4. **Event listener management** - Listeners not cleaned up properly
5. **Edge case handling** - Null/undefined checks missing

---

## Recommendations

### Immediate Actions (CRITICAL)
1. Implement proper cleanup in `deleteItem()` to remove all event listeners
2. Add mutex/lock mechanism for save operations to prevent race conditions
3. Implement a blob URL registry with cleanup on item deletion
4. Add validation/try-catch around URL operations

### Short-term (HIGH)
1. Clear search results when items are deleted
2. Add `labelEl` cleanup to canvas switch and state restoration
3. Validate import data fully before clearing existing state
4. Consider per-canvas undo/redo stacks

### Long-term (MEDIUM)
1. Refactor to use event delegation more consistently to reduce listener count
2. Implement WeakRef or cleanup registry for item references
3. Add comprehensive error boundaries for storage operations
4. Add window resize handler for viewport/minimap updates

### Testing Recommendations
1. Add memory profiling to detect leaks during long sessions
2. Test concurrent save operations
3. Test undo/redo across canvas switches
4. Test search after item deletion

---

## Appendix: File Reference

| File | Primary Concerns |
|------|------------------|
| `js/items.js` | Memory leaks, event listeners, media handling |
| `js/ui.js` | Race conditions, DOM cleanup, state management |
| `js/state.js` | Proxy limitations, Set/Map mutations |
| `js/connections.js` | DOM cleanup (generally well-handled) |
| `js/events.js` | Touch handling, keyboard shortcuts |
| `js/storage.js` | Error handling, IndexedDB operations |
| `js/viewport.js` | Initialization order, window resize |
| `js/app.js` | Import/export, initialization |

---

*This report was generated through comprehensive static analysis of the KnotPad codebase.*
