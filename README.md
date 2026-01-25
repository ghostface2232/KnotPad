# KnotPad

A web-based infinite canvas note-taking application for visual thinking and idea organization.

## Overview

KnotPad is a minimalist, offline-capable canvas app that lets you create and connect notes, keywords, links, images, and videos in a visual workspace. Think of it as a digital whiteboard meets mind mapping tool.

**Live Demo**: Deploy to any static hosting service or run locally.

## Features

### Core Functionality

- **Infinite Canvas** - Pan and zoom freely across an unlimited workspace
- **Multiple Item Types**
  - **Memos** - Rich text notes with formatting (bold, italic, strikethrough, headings)
  - **Keywords** - Compact labels for tagging and categorization
  - **Links** - Bookmarks with optional preview images
  - **Images** - Drag & drop or paste images directly
  - **Videos** - Embed video files with custom playback controls
- **Visual Connections** - Draw lines between items with optional labels and directional arrows
- **Multi-Canvas** - Organize work across multiple canvases with groups

### Organization

- **Color Coding** - 7 colors (red, orange, yellow, green, blue, purple, pink) for visual categorization
- **Color Filtering** - Filter canvas view by color
- **Search** - Find items across all content with keyboard navigation
- **Minimap** - Bird's eye view for quick navigation

### Editing

- **Undo/Redo** - Full history support
- **Multi-Select** - Box selection and Shift+click for bulk operations
- **Duplicate** - Alt+drag or context menu to copy items
- **Resize** - Drag corners to resize memos and media
- **Lock** - Prevent accidental edits to important items

### Customization

- **Light/Dark Theme** - System-aware with manual toggle
- **Font Sizes** - Multiple sizes for memos
- **Text Alignment** - Left, center, right alignment
- **Word Wrap Modes** - Character-level or word-level wrapping
- **Grid Snap** - Optional alignment to grid

### Data & Storage

- **Auto-Save** - Changes saved automatically to browser storage
- **Offline Support** - Full PWA with service worker caching
- **File System API** - Optional sync to local folder (Chrome/Edge)
- **Export/Import** - Backup and restore canvas data

## Installation

### As a Web App (Recommended)

1. Visit the hosted URL in a modern browser
2. Click the install button in the address bar (or use browser menu)
3. KnotPad will be added to your home screen/desktop

### As a PWA on Desktop (Chrome/Edge)

1. Open KnotPad in Chrome or Edge
2. Click the install icon (⊕) in the address bar
3. Or: Menu (⋮) → "Install KnotPad..."
4. Launch from your applications folder

### As a PWA on Mobile

**iOS (Safari)**:
1. Open KnotPad in Safari
2. Tap the Share button (⎙)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" to confirm

**Android (Chrome)**:
1. Open KnotPad in Chrome
2. Tap Menu (⋮) → "Add to Home Screen"
3. Or accept the install prompt banner

### Self-Hosting

```bash
# Clone the repository
git clone https://github.com/ghostface2232/KnotPad.git

# Serve with any static file server
cd KnotPad
npx serve .
# Or: python -m http.server 8000
# Or: php -S localhost:8000
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + F` | Search |
| `Delete` / `Backspace` | Delete selected |
| `Escape` | Cancel / Close |
| `Space + Drag` | Pan canvas |
| `Alt + Drag` | Duplicate item |
| `Ctrl/Cmd + B` | Bold (in memo) |
| `Ctrl/Cmd + I` | Italic (in memo) |
| `Ctrl/Cmd + D` | Strikethrough (in memo) |
| `Ctrl/Cmd + H` | Toggle heading (in memo) |

## Browser Support

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome 80+ | Full | Best experience, File System API supported |
| Edge 80+ | Full | File System API supported |
| Firefox 75+ | Partial | No File System API |
| Safari 14+ | Partial | No File System API |

## Important Notes

### Data Storage

- **Default storage**: IndexedDB + localStorage (browser-based)
- Data persists until browser data is cleared
- For persistent storage, enable File System API in Settings (Chrome/Edge only)
- Regularly export backups for important work

### Performance

- Recommended: < 500 items per canvas for optimal performance
- Large images/videos are stored in IndexedDB
- Clear unused canvases to free up storage

### Known Limitations

- File System API requires user permission on each session
- Very large canvases may slow down on low-end devices
- Video playback depends on browser codec support

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 Modules)
- **Styling**: CSS3 with CSS Custom Properties
- **Storage**: IndexedDB, localStorage, File System Access API
- **Offline**: Service Worker with cache-first strategy

## Development

See [AGENTS.md](AGENTS.md) for detailed development documentation including:
- File structure and module responsibilities
- Feature location guide
- State management patterns
- Common bug patterns to avoid

## License

MIT License - See [LICENSE](LICENSE) for details.

---

Made with care for visual thinkers.
