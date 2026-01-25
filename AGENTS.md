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

> 이 섹션은 프로젝트에서 반복적으로 발생했던 버그 패턴을 정리한 것입니다. 코드 작성 및 수정 시 아래 항목들을 주의하세요.

### 리소스 정리 (Cleanup)

| 주의 항목 | 가이드라인 |
|-----------|------------|
| **이벤트 리스너** | 요소 삭제 전 반드시 리스너 정리. `AbortController` 활용 권장 |
| **DOM 요소** | 부모 삭제 시 연관 요소(label, hitArea, arrow 등)도 함께 제거 |
| **Blob URL** | 미디어 삭제/실패 시 `revokeObjectURL()` 호출 필수 |
| **타이머** | 새 작업 시작 전 기존 타이머 취소 (`clearTimeout`) |

### 상태 관리 (State)

| 주의 항목 | 가이드라인 |
|-----------|------------|
| **직렬화 완전성** | 새 속성 추가 시 모든 저장 함수 업데이트 (`saveState`, `saveCurrentCanvas`, `saveToLocalStorageSync`) |
| **연관 상태 정리** | 아이템 삭제 시 `searchResults`, `selectedItems`, 연결선 참조도 정리 |
| **Z-Index 계산** | 로드 시 저장값과 실제 아이템 값 중 최대값으로 계산 |

### 초기화 및 타이밍

| 주의 항목 | 가이드라인 |
|-----------|------------|
| **초기화 순서** | 캔버스 로드 완료 후 UI 초기화 함수 호출 |
| **비동기 경쟁** | 중복 실행 방지 플래그 사용, Promise 거부 처리 |
| **Null 체크** | 외부 입력(URL 등) 처리 전 유효성 검증 |

### UI 및 렌더링

| 주의 항목 | 가이드라인 |
|-----------|------------|
| **CSS 속성** | 기본값에 의존하지 말고 명시적으로 설정 |
| **HTML 처리** | 검색/표시 시 HTML 태그 제거 후 텍스트만 사용 |
| **필터 동기화** | 아이템 필터링 시 연결선 가시성도 함께 업데이트 |

### 체크리스트

코드 변경 시 확인:

- [ ] 이벤트 리스너 정리 메커니즘 존재
- [ ] 삭제/복원 시 연관 DOM 요소 제거
- [ ] 새 속성이 모든 저장/복원 함수에 반영
- [ ] 초기화 순서가 의존성 준수
- [ ] 외부 입력에 대한 null 체크 존재
- [ ] 타이머/비동기 작업 취소 처리
- [ ] Blob URL 해제
- [ ] 삭제 시 연관 상태 정리
- [ ] 필터 상태가 연관 요소에 전파
