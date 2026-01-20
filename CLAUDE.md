# KnotPad Project Guide

> **For AI Agents & Coding Assistants**: Read this file first to understand the project structure.

## Project Overview

KnotPad is a web-based infinite canvas note-taking application. It supports creating memos, keywords, links, images, and videos with visual connections between nodes. The app works as a PWA (Progressive Web App) with offline support.

**Tech Stack**: Vanilla JavaScript (ES6 Modules), CSS3, HTML5, IndexedDB, File System Access API

---

## Critical: Cache Version Update

**IMPORTANT**: When making significant changes, update the cache version in `sw.js`:

```javascript
// sw.js:1
const CACHE_VERSION = 'v15.2';  // <-- Increment this!
```

**When to update**:
- Major feature additions: bump minor version (v15.2 -> v16.0)
- Bug fixes / minor changes: bump patch version (v15.2 -> v15.3)
- CSS/styling changes: bump patch version
- New assets added: bump patch version

**Maintenance commitment**:
- For every feature addition or bug-fix maintenance commit, update the `sw.js` cache version and keep the relevant guide sections in this document accurate (feature locations, module responsibilities, and storage keys).

---

## File Structure

```
KnotPad/
├── index.html          # Main HTML structure, all UI elements
├── style.css           # All styles (theming, components, animations)
├── sw.js               # Service Worker (caching, offline support)
├── manifest.json       # PWA manifest
├── CLAUDE.md           # This guide file
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
| `knotpad-fs-enabled` | File System API enabled |
