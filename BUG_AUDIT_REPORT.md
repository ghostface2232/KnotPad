# KnotPad Bug Audit Report

**Date:** 2026-01-25
**Auditor:** Claude Code Review
**Codebase Version:** v15.8.10

---

## Executive Summary

A comprehensive code review of the KnotPad codebase identified **24 bugs** across the application, categorized by severity. The most critical issues relate to memory management, data persistence, and race conditions that could lead to data loss or application instability.

---

## Critical Severity (Application-Breaking / Data Loss Risk)

### BUG-001: Memory Leak - Event Listener Accumulation
**Location:** Multiple files
**Impact:** Application slows down and may crash in long-running sessions

**Description:** The codebase has 195 `addEventListener` calls but only 8 `removeEventListener` calls. While `AbortController` is used in `setupItemEvents` (`items.js:429`), many other listeners lack cleanup:
- `renderCanvasList` (`ui.js:786-867`) re-binds listeners on every render without removing old ones
- `setupSearchEvents`, `setupSettingsModal`, and similar setup functions add listeners without cleanup mechanisms
- Document-level listeners in `events.js` are never removed

**Recommendation:** Implement systematic event listener cleanup using AbortController patterns or track and remove listeners before re-adding.

---

### BUG-002: Race Condition in Auto-Save on Canvas Switch
**Location:** `ui.js:517-567` (`switchCanvas`)
**Impact:** Potential data corruption when rapidly switching canvases

**Description:** When switching canvases:
```javascript
if (state.currentCanvasId) {
    await saveCurrentCanvas(); // Can fail or be interrupted
}
state.blobURLCache.forEach(url => URL.revokeObjectURL(url));
```
If `saveCurrentCanvas` is interrupted, blob URLs are revoked before save completes, causing media references to break.

**Recommendation:** Implement a locking mechanism or queue for canvas operations to prevent concurrent saves.

---

### BUG-003: Undo/Redo History Lost on Browser Close
**Location:** `ui.js:2595-2631` (`saveToLocalStorageSync`)
**Impact:** Users lose undo history unexpectedly

**Description:** The synchronous save function (used on `beforeunload`) doesn't include `undoStack` and `redoStack`:
```javascript
// Missing from saveToLocalStorageSync:
undoStack: state.undoStack,  // NOT SAVED
redoStack: state.redoStack   // NOT SAVED
```
However, `saveCurrentCanvas` (line 369-370) does save them, creating inconsistent behavior.

**Recommendation:** Add undoStack and redoStack to `saveToLocalStorageSync`.

---

### BUG-004: Duplicated Canvas Missing Media
**Location:** `ui.js:1568-1600` (`duplicateCanvas`)
**Impact:** Duplicated canvases have broken images and videos

**Description:** Only localStorage data is copied, not IndexedDB media blobs:
```javascript
const originalData = localStorage.getItem('knotpad-data-' + canvasId);
if (originalData) {
    localStorage.setItem('knotpad-data-' + newCanvas.id, originalData);
}
// Media blobs in IndexedDB are NOT copied
```

**Recommendation:** Copy media blobs from IndexedDB/FileSystem when duplicating canvas.

---

## High Severity (Significant UX/Functionality Issues)

### BUG-005: Connection ID Collision
**Location:** `connections.js:94`
**Impact:** Duplicate connection IDs may cause selection/deletion bugs

**Description:** Connection IDs use `Date.now()` which can collide within the same millisecond:
```javascript
id: `c${Date.now()}`,
```

**Recommendation:** Use a combination of timestamp and random suffix, or a UUID generator.

---

### BUG-006: Search Results Stale References
**Location:** `ui.js:102-125`, `items.js` (delete functions)
**Impact:** Clicking search results may cause errors after items are deleted

**Description:** When items are deleted, `state.searchResults` still contains references to deleted items. No cleanup occurs in `deleteItem` or `deleteSelectedItems`.

**Recommendation:** Clear or update searchResults when items are deleted.

---

### BUG-007: Missing Visual Feedback for Broken Media
**Location:** `ui.js:240-303` (`restoreState`)
**Impact:** Users see broken media items without understanding why

**Description:** When restoring state, items with missing media are still created but display incorrectly without user feedback.

**Recommendation:** Add visual indicator and tooltip explaining media is unavailable.

---

### BUG-008: Empty Catch Blocks Silently Swallowing Errors
**Location:** Multiple files
**Impact:** Debugging difficulties, silent failures

**Description:**
- `ui.js:1971` - Empty catch block
- `items.js:65` - Silent failure for link previews
- `items.js:323` - URL parsing failure silently ignored

**Recommendation:** Add proper error logging or user feedback for caught errors.

---

### BUG-009: Inconsistent Timer Cleanup
**Location:** Throughout codebase
**Impact:** Potential memory leaks and unexpected behavior

**Description:** 33 `setTimeout` calls but only 8 `clearTimeout` calls. Timers in group rename, modal focus, and animation removal are not properly tracked.

**Recommendation:** Store timer IDs and clear them appropriately in cleanup functions.

---

## Medium Severity (Noticeable Issues)

### BUG-010: Escape Key Over-triggering
**Location:** `events.js:364-370`
**Impact:** Unexpected behavior when pressing Escape

**Description:** Escape calls multiple close functions unconditionally, which may interfere with text editing or cause unnecessary state changes.

**Recommendation:** Check if each modal/state is active before closing.

---

### BUG-011: Touch Event State Leak
**Location:** `events.js:278-314` (`setupTouchEvents`)
**Impact:** Panning state stuck on touch devices

**Description:** `isPanning` state may not reset if touch events are interrupted. Missing `touchcancel` event handler.

**Recommendation:** Add touchcancel handler to reset panning state.

---

### BUG-012: No XSS Validation on Dropped URLs
**Location:** `events.js:418-423`
**Impact:** Potential XSS vulnerability

**Description:** Dropped URLs are used directly without sanitization.

**Recommendation:** Validate and sanitize URLs before creating link items.

---

### BUG-013: Connection Label Visibility on Filter
**Location:** `ui.js:1123-1162` (`updateMinimap`)
**Impact:** Visual inconsistency when filtering items

**Description:** Connection visibility is filtered but label elements may remain visible when their connections are filtered out.

**Recommendation:** Hide labels when their connections are filtered.

---

### BUG-014: Icon Picker Overflow
**Location:** `ui.js:1026-1058` (`openIconPicker`)
**Impact:** Picker may overflow sidebar bounds

**Description:** Position calculation only checks vertical bounds, not horizontal overflow.

**Recommendation:** Add horizontal bounds checking.

---

### BUG-015: Rename Input State Leak
**Location:** `ui.js:1001-1024` (`startRename`)
**Impact:** Draggable state may remain false

**Description:** If rename is interrupted without completing, `draggable` attribute remains false.

**Recommendation:** Use finally block or ensure cleanup on element removal.

---

### BUG-016: Color Group Mode Not Persisted
**Location:** `ui.js:557-562` (`switchCanvas`)
**Impact:** Color grouping layout lost on canvas switch

**Description:** Color group mode is reset on canvas switch but original positions are not persisted.

**Recommendation:** Either persist color group positions or provide clear user feedback about reset.

---

## Low Severity (Minor Issues / Code Quality)

### BUG-017: Hardcoded Magic Numbers
**Location:** Throughout codebase
**Impact:** Maintenance difficulty, inconsistent behavior

**Description:** Various hardcoded offsets for positioning: `-100`, `-70`, `-90`, `-60`, `-130`, `-50`, `100` gap, `220`/`140` dimensions.

**Recommendation:** Extract to constants in `constants.js`.

---

### BUG-018: Missing Null Check in Theme Toggle
**Location:** `ui.js:67-71` (`updateThemeIcon`)
**Impact:** Potential error if elements missing

**Description:** No null check before accessing moon/sun elements.

**Recommendation:** Add null checks before property access.

---

### BUG-019: Passive Event Listener Warning
**Location:** `events.js:293-311`
**Impact:** Performance warnings in console

**Description:** `passive: false` on touch events may cause performance warnings.

**Recommendation:** Document why passive: false is required, consider alternatives.

---

### BUG-020: JSON Stringify Circular Reference Risk
**Location:** `ui.js:175`
**Impact:** Potential crash on complex content

**Description:** Deep cloning with `JSON.parse(JSON.stringify())` will fail on circular references.

**Recommendation:** Use a deep clone function that handles circular references.

---

### BUG-021: Service Worker Cache Strategy
**Location:** `sw.js:45-54`
**Impact:** Slow offline loading

**Description:** Network-first strategy may cause long loading times if network is slow but available.

**Recommendation:** Consider stale-while-revalidate strategy.

---

### BUG-022: Global Variable Pollution
**Location:** `ui.js:1286-1289`
**Impact:** Code quality, potential conflicts

**Description:** Uses `window.selectedItem` global instead of proper state management.

**Recommendation:** Use state module for selected item tracking.

---

### BUG-023: Inconsistent Error Feedback
**Location:** Various
**Impact:** Confusing user experience

**Description:** Some operations show toast on failure, others silently fail.

**Recommendation:** Establish consistent error feedback pattern.

---

### BUG-024: Link Preview Height Reset Hardcoded
**Location:** `items.js:79-80`
**Impact:** May alter user's intended layout

**Description:** Fixed height reset ignores original item dimensions.

**Recommendation:** Store and restore original height.

---

## Summary

| Severity | Count | Examples |
|----------|-------|----------|
| Critical | 4 | Memory leaks, race conditions, data loss |
| High | 5 | Broken features, silent failures |
| Medium | 7 | Edge cases, UI inconsistencies |
| Low | 8 | Code quality, minor UX issues |
| **Total** | **24** | |

## Recommended Fix Priority

1. **Immediate**: BUG-001 (Memory Leak), BUG-003 (Undo/Redo Loss)
2. **High Priority**: BUG-004 (Duplicate Canvas Media), BUG-002 (Race Condition)
3. **Medium Priority**: BUG-005 through BUG-009
4. **Low Priority**: Remaining issues as time permits

---

*This report was generated through comprehensive static code analysis of the KnotPad codebase.*
