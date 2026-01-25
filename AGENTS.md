# KnotPad Project Guide

> **IMPORTANT**: After any code modification, update this file if the change affects: feature locations, module responsibilities, storage keys, or configuration. Keep this document in sync with the codebase. (`CLAUDE.md` is a symlink to this file.)

## Project Overview

KnotPad is a web-based infinite canvas note-taking application. It supports creating memos, keywords, links, images, and videos with visual connections between nodes. The app works as a PWA (Progressive Web App) with offline support.

**Tech Stack**: Vanilla JavaScript (ES6 Modules), CSS3, HTML5, IndexedDB, File System Access API

---

## Cache Version Update

**IMPORTANT**: When making changes, update the cache version in `sw.js`:

```javascript
// sw.js:1
const CACHE_VERSION = 'vnn.n.n';  // <-- Increment this!
```

**Version format**: `vMAJOR.MINOR.PATCH`

| Level | When to bump | Example |
|-------|--------------|---------|
| **MAJOR** | Breaking changes, architecture overhaul | v15.3.0 → v16.0.0 |
| **MINOR** | New features, significant enhancements | v15.3.0 → v15.4.0 |
| **PATCH** | Bug fixes, minor tweaks, CSS/styling changes, new assets | v15.3.0 → v15.3.1 |

---

## File Structure

```
KnotPad/
├── index.html          # Main HTML structure, all UI elements
├── style.css           # All styles (theming, components, animations)
├── sw.js               # Service Worker (caching, offline support)
├── manifest.json       # PWA manifest
├── AGENTS.md           # Project guide (master file)
├── CLAUDE.md           # Symlink to AGENTS.md
├── js/
│   ├── app.js          # Entry point, initialization, event bus wiring
│   ├── state.js        # Global state management (Proxy-based reactive)
│   ├── items.js        # Canvas items (memo, keyword, link, image, video)
│   ├── connections.js  # Connection lines between items
│   ├── ui.js           # UI components, modals, sidebar, canvas management
│   ├── events.js       # Mouse, touch, keyboard, drag-drop handlers
│   ├── viewport.js     # Zoom, pan, transform, minimap
│   ├── storage.js      # IndexedDB, File System API, persistence
│   ├── utils.js        # Helper functions (DOM, math, formatting)
│   ├── constants.js    # Configuration constants, color maps
│   └── events-bus.js   # Central event emitter (pub/sub pattern)
├── fonts/              # Custom fonts (SFKR family)
└── icons/              # PWA icons (192px, 512px)
```

---

## Module Responsibilities

### Core Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `app.js` | Entry point, bootstrapping | `init()` |
| `state.js` | Reactive state with Proxy | `state`, setters (`setScale`, `setOffsetX`, etc.) |
| `events-bus.js` | Decoupled communication | `eventBus`, `Events` constants |

### Feature Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `items.js` | Item CRUD, selection, colors | `createItem`, `addMemo`, `addKeyword`, `addLink`, `deleteItem`, `setItemColor` |
| `connections.js` | Connection management | `addConnection`, `updateConnection`, `deleteConnection`, `startConnection` |
| `ui.js` | UI setup, canvas/sidebar management | `loadCanvases`, `saveCurrentCanvas`, `saveState`, `undo`, `redo` |
| `events.js` | Input event handlers | `setupMouseEvents`, `setupKeyboardEvents`, `setupTouchEvents` |
| `viewport.js` | Canvas transform, zoom | `setZoom`, `fitToScreen`, `panToItem`, `updateTransform` |
| `storage.js` | Data persistence | `initMediaDB`, `saveMedia`, `loadMedia`, File System functions |

### Utility Modules

| File | Purpose | Key Exports |
|------|---------|-------------|
| `utils.js` | Helper functions | `$` (DOM selector), `esc`, `curvePath`, `showToast` |
| `constants.js` | App configuration | `COLORS`, `COLOR_MAP`, `CANVAS_ICONS`, `FONT_SIZES` |

---

## Feature Location Guide

### Items (Nodes)

| Feature | Location |
|---------|----------|
| Create memo | `items.js:addMemo()` |
| Create keyword | `items.js:addKeyword()` |
| Create link | `items.js:addLink()` |
| Handle image/video | `ui.js:handleFile()` |
| Item rendering | `items.js:createItem()` |
| Item events | `items.js:setupItemEvents()` |
| Color management | `items.js:setItemColor()` |
| Font size cycling | `items.js:setItemFontSize()` |
| Selection | `items.js:selectItem()`, `deselectAll()` |
| Deletion | `items.js:deleteItem()`, `deleteSelectedItems()` |
| Duplication | `items.js:duplicateItem()` |
| Color grouping | `items.js:toggleColorGroupMode()`, `arrangeByColor()` |

### Connections

| Feature | Location |
|---------|----------|
| Create connection | `connections.js:addConnection()` |
| Draw temp line | `connections.js:startConnection()`, `updateTempLine()` |
| Complete connection | `connections.js:completeConnection()` |
| Direction arrows | `connections.js:updateConnectionArrow()` |
| Connection labels | `connections.js:updateConnectionLabel()` |
| Curved paths | `utils.js:curvePath()` |

### Canvas & Viewport

| Feature | Location |
|---------|----------|
| Zoom | `viewport.js:setZoom()` |
| Pan | `viewport.js:startPan()`, `events.js` mouse handlers |
| Fit to screen | `viewport.js:fitToScreen()` |
| Transform update | `viewport.js:updateTransform()` |
| Minimap | `viewport.js:updateMinimap()`, `ui.js:setupMinimapClick()` |

### UI Components

| Feature | Location |
|---------|----------|
| Sidebar | `ui.js:setupSidebarResize()`, `app.js:setupSidebarEvents()` |
| Canvas list | `ui.js:loadCanvases()`, `renderCanvasList()` |
| Context menus | `ui.js:setupContextMenu()`, `showContextMenu()` |
| Search | `ui.js:setupSearchEvents()`, `toggleSearch()` |
| Modals | `ui.js:setupLinkModal()`, `setupSettingsModal()` |
| Theme toggle | `ui.js:toggleTheme()`, `loadTheme()` |
| Toast notifications | `utils.js:showToast()` |

### Storage & Persistence

| Feature | Location |
|---------|----------|
| IndexedDB init | `storage.js:initMediaDB()` |
| Save/load media | `storage.js:saveMedia()`, `loadMedia()` |
| File System API | `storage.js:selectStorageFolder()`, `saveCanvasToFileSystem()` |
| Auto-save | `ui.js:triggerAutoSave()` |
| Undo/redo | `ui.js:saveState()`, `undo()`, `redo()` |

### Events & Input

| Feature | Location |
|---------|----------|
| Mouse events | `events.js:setupMouseEvents()` |
| Touch events | `events.js:setupTouchEvents()` |
| Keyboard shortcuts | `events.js:setupKeyboardEvents()` |
| Drag & drop | `events.js:setupDragDropEvents()` |
| Copy/paste | `events.js:setupCopyEvents()`, `setupPasteEvents()` |

---

## Design & Styling

### CSS Structure (style.css)

| Section | Keywords (examples) | Content |
|---------|---------------------|---------|
| Variables | `:root`, `--` | CSS custom properties, theme colors |
| Base | `body`, `#app`, `.canvas` | Body, app container, canvas |
| Items | `.canvas-item`, `.item-memo`, `.item-keyword`, `.item-link` | Item styling |
| Connections | `.connection-line`, `.connection-arrow` | Connection styling |
| UI Components | `.toolbar`, `.sidebar`, `.modal`, `.context-menu` | Toolbar, sidebar, modals, context menus |
| Animations | `@keyframes`, `transition` | Keyframes, transitions |
| Dark theme | `[data-theme="dark"]` | Theme overrides |

### Theme System

- Light/dark toggle: `ui.js:toggleTheme()`
- Theme stored in: `localStorage` with key `knotpad-theme`
- CSS uses `[data-theme="dark"]` attribute on `<html>`

### Color System

Defined in `constants.js:COLOR_MAP`:
- red: `#ef4444`
- orange: `#f97316`
- yellow: `#eab308`
- green: `#22c55e`
- blue: `#3b82f6`
- purple: `#8b5cf6`
- pink: `#ec4899`

---

## State Management

### Reactive State (state.js)

The app uses a Proxy-based reactive state system:

```javascript
import * as state from './state.js';

// Read state
console.log(state.scale, state.offsetX);

// Write state (use setters)
state.setScale(1.5);
state.setOffsetX(100);
```

### Key State Properties

| Property | Purpose |
|----------|---------|
| `scale`, `offsetX`, `offsetY` | Viewport transform |
| `items`, `connections` | Canvas content |
| `selectedItems`, `selectedConn` | Selection state |
| `canvases`, `currentCanvasId` | Multi-canvas support |
| `undoStack`, `redoStack` | History for undo/redo |
| `colorGroupModeActive` | Color grouping toggle |

### Event Bus (events-bus.js)

Inter-module communication via pub/sub:

```javascript
import eventBus, { Events } from './events-bus.js';

// Emit
eventBus.emit(Events.STATE_SAVE);

// Listen
eventBus.on(Events.CONNECTIONS_UPDATE, (conn) => { ... });
```

---

## Development Notes

### Adding New Features

1. **New item type**: Extend `items.js:createItem()` switch statement
2. **New toolbar button**: Add HTML in `index.html`, handler in `app.js:setupToolbarEvents()`
3. **New keyboard shortcut**: Add in `events.js:setupKeyboardEvents()`
4. **New setting**: Add to `state.js` (with localStorage sync), UI in settings modal

### Common Patterns

- DOM selection: Use `$('elementId')` from utils.js
- Event communication: Use `eventBus.emit()` instead of direct function calls
- State changes: Always use setter functions from state.js
- Async operations: Storage functions return Promises

### Behavior Flow Guide (High Level)

- **Item creation**: `events.js` (input) → `items.js` (create/add) → `state.js` (state update) → `viewport.js`/`ui.js` (render/minimap refresh).
- **Connections**: `items.js` (start) → `connections.js` (update/complete) → `events-bus.js` (emit updates) → `ui.js` (re-render labels/lines).
- **Persistence**: `ui.js` (save triggers) → `storage.js` (IndexedDB/File System) → `state.js` (restore on load).

### Debugging Tips

- Canvas items: `state.items` array contains all items
- Connections: `state.connections` array
- Current canvas: `state.currentCanvasId`
- Zoom level: `state.scale`

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` or `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + F` | Search |
| `Ctrl/Cmd + S` | (Blocked - auto-saves) |
| `Ctrl/Cmd + B` | Bold (in memo) |
| `Ctrl/Cmd + I` | Italic (in memo) |
| `Ctrl/Cmd + D` | Strikethrough (in memo) |
| `Ctrl/Cmd + H` | Toggle heading (in memo) |
| `Space + Drag` | Pan canvas |
| `Delete/Backspace` | Delete selected |
| `Escape` | Cancel/close |
| `Alt + Drag` | Duplicate item |

---

## LocalStorage Keys

| Key | Purpose |
|-----|---------|
| `knotpad-canvases` | Canvas list metadata |
| `knotpad-canvas-groups` | Canvas group structure |
| `knotpad-data-{canvasId}` | Individual canvas data |
| `knotpad-theme` | Light/dark theme |
| `knotpad-sidebar-pinned` | Sidebar pin state |
| `knotpad-sidebar-open` | Sidebar open state |
| `knotpad-default-font-size` | Default memo font size |
| `knotpad-note-wrap-mode` | Text wrap mode |
| `knotpad-default-text-align` | Default text alignment |
| `knotpad-invert-wheel-zoom` | Zoom direction preference |
| `knotpad-grid-snap` | Grid snap toggle |
| `knotpad-color-display-mode` | Color display mode (bar/fill) |
| `knotpad-link-preview-enabled` | Link preview image toggle |
| `knotpad-fs-enabled` | File System API enabled |

---

## Coding Guidelines: Common Bug Patterns to Avoid

> **IMPORTANT**: This section documents recurring bugs that have been fixed in the project. When writing or modifying code, carefully review these patterns to prevent regressions.

### 1. Event Listener Management

**Problem**: Event listeners not being properly cleaned up cause memory leaks.

**Solution**:
- Use `AbortController` for element-level listeners:
  ```javascript
  const controller = new AbortController();
  el.addEventListener('click', handler, { signal: controller.signal });
  // Store controller on element for cleanup
  el._abortController = controller;
  ```
- Store window/document level listeners for manual removal:
  ```javascript
  el._windowHandlers = { seeking: handler };
  window.addEventListener('seeking', handler);
  // On cleanup:
  window.removeEventListener('seeking', el._windowHandlers.seeking);
  ```
- Always call cleanup function before DOM removal in `deleteItem()`

### 2. DOM Element Cleanup

**Problem**: DOM elements (labels, hit areas, error handlers) persist after parent deletion or undo/redo.

**Solution**:
- When removing connections, also remove: `labelEl`, `hitArea`, `arrowEl`
- In `restoreState()`, clean up ALL associated elements before restoring
- In `clearItemsAndConnections()`, iterate and remove every child element
- Example pattern:
  ```javascript
  if (conn.labelEl) conn.labelEl.remove();
  if (conn.hitArea) conn.hitArea.remove();
  ```

### 3. State Serialization Completeness

**Problem**: Properties missing from save functions cause data loss.

**Solution**:
- When adding new item/connection properties, update ALL save functions:
  - `saveState()` (undo/redo)
  - `saveToLocalStorageSync()` (emergency save on beforeunload/visibilitychange)
  - `saveCurrentCanvas()` (normal save)
- Checklist for new properties:
  - [ ] Added to `saveState()` item/connection mapping
  - [ ] Added to `saveToLocalStorageSync()`
  - [ ] Restored properly in `restoreState()`
  - [ ] Loaded correctly in `loadCanvasData()`

### 4. Initialization Order

**Problem**: Features fail when called before dependencies are ready.

**Solution**:
- Call UI initialization functions AFTER `loadCanvases()` completes
- Pattern:
  ```javascript
  await loadCanvases();
  applyLinkPreviewMode();  // Now items exist to receive previews
  ```
- Document initialization dependencies in function comments

### 5. Null/Undefined Reference Validation

**Problem**: Crashes from accessing properties on null/undefined values.

**Solution**:
- Validate inputs before processing:
  ```javascript
  if (!cfg.content) return;
  try {
    const url = new URL(cfg.content);
  } catch (e) {
    // Handle invalid URL gracefully
  }
  ```
- Check array/object existence before iteration
- Validate DOM elements before manipulation

### 6. Race Conditions & Async Operations

**Problem**: Concurrent operations cause data corruption or memory leaks.

**Solution**:
- Cancel pending timers before starting new operations:
  ```javascript
  if (state.autoSaveTimer) {
    clearTimeout(state.autoSaveTimer);
  }
  ```
- Use flags to prevent duplicate operations
- Handle Promise rejections properly

### 7. Blob URL Memory Leaks

**Problem**: Blob URLs not revoked cause memory to grow indefinitely.

**Solution**:
- Track blob URLs and revoke when no longer needed:
  ```javascript
  URL.revokeObjectURL(blobUrl);
  ```
- Clean up blob URLs on: item deletion, media reload failure, app unload
- Remove invalid URLs from cache

### 8. Related State Cleanup

**Problem**: Related state (searchResults, selection) not cleaned when items are deleted.

**Solution**:
- When deleting items, also clean:
  - `state.searchResults` (remove deleted item references)
  - `state.selectedItems` (remove from selection)
  - Connection references (delete connections to/from deleted item)
- Pattern:
  ```javascript
  state.searchResults = state.searchResults.filter(r => r.item.id !== id);
  ```

### 9. Z-Index Calculation

**Problem**: `highestZ` not properly calculated on load causes items to go behind instead of in front.

**Solution**:
- Calculate `highestZ` as maximum of saved value AND actual item z-indexes:
  ```javascript
  const maxItemZ = items.reduce((max, item) =>
    Math.max(max, item.zIndex || 0), 0);
  state.highestZ = Math.max(savedHighestZ || 1, maxItemZ);
  ```

### 10. CSS Property Inheritance

**Problem**: CSS classes/properties not being explicitly set cause unexpected inheritance.

**Solution**:
- Set properties explicitly instead of relying on defaults:
  ```javascript
  // Wrong: el.style.textAlign = '';
  // Right: el.style.textAlign = 'left';
  ```
- When overriding container CSS, set explicit values
- Remove inherited classes when applying new styles

### 11. HTML Content in Search/Display

**Problem**: HTML tags included in search or display text cause incorrect matches.

**Solution**:
- Strip HTML when searching text content:
  ```javascript
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || '';
  }
  ```
- Use `textContent` instead of `innerHTML` for plain text operations

### 12. Filter State Synchronization

**Problem**: Related elements (connections) not updated when items are filtered.

**Solution**:
- When filtering items, also update connection visibility:
  ```javascript
  connections.forEach(conn => {
    const fromFiltered = isFiltered(conn.from);
    const toFiltered = isFiltered(conn.to);
    if (fromFiltered || toFiltered) {
      conn.el.classList.add('filtered-out');
    }
  });
  ```
- Apply filter class to all connection elements (line, arrow, label, hitArea)

### Quick Reference Checklist

When making changes, verify:

- [ ] Event listeners have cleanup mechanism (AbortController or stored reference)
- [ ] DOM elements are removed when parent is deleted/restored
- [ ] New properties are added to ALL save/restore functions
- [ ] Initialization order respects dependencies
- [ ] Null checks exist for external/user input
- [ ] Timers/async operations handle cancellation
- [ ] Blob URLs are properly revoked
- [ ] Related state is cleaned up on deletion
- [ ] Z-index values are properly calculated
- [ ] CSS properties are set explicitly
- [ ] HTML is stripped for text operations
- [ ] Filter state propagates to related elements
