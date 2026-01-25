# KnotPad

A web-based infinite canvas note-taking application for visual thinking and idea organization.

## Features

- **Infinite Canvas** - Pan and zoom across an unlimited workspace
- **Multiple Item Types** - Memos (rich text), keywords, links, images, videos
- **Visual Connections** - Draw lines between items with labels and arrows
- **Multi-Canvas** - Organize work across multiple canvases with groups
- **Color Coding** - 7 colors for visual categorization and filtering
- **Undo/Redo** - Full history support
- **Light/Dark Theme** - System-aware with manual toggle
- **Offline Support** - Full PWA with service worker caching
- **File System Sync** - Optional local folder sync (Chrome/Edge)

## Installation

### PWA Installation (Recommended)

**Desktop (Chrome/Edge)**:
1. Open KnotPad in browser
2. Click the install icon (⊕) in the address bar
3. Or: Menu → "Install KnotPad..."

**iOS (Safari)**:
1. Tap Share button (⎙)
2. Tap "Add to Home Screen"

**Android (Chrome)**:
1. Tap Menu (⋮) → "Add to Home Screen"

### Self-Hosting

```bash
git clone https://github.com/ghostface2232/KnotPad.git
cd KnotPad
npx serve .
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + F` | Search |
| `Delete` | Delete selected |
| `Escape` | Cancel / Close |
| `Space + Drag` | Pan canvas |
| `Alt + Drag` | Duplicate item |

## Browser Support

- **Chrome/Edge 80+**: Full support (File System API available)
- **Firefox 75+**: Partial (no File System API)
- **Safari 14+**: Partial (no File System API)

## Notes

- Data stored in browser (IndexedDB + localStorage)
- Enable File System API in Settings for persistent local storage
- Export backups regularly for important work

## Development

See [AGENTS.md](AGENTS.md) for development documentation.
