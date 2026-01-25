<img src="https://github.com/user-attachments/assets/8d4b5261-871f-44a5-ba7d-db780d5410ac" width="20%"></img>

# KnotPad
A web-based infinite canvas note-taking application for visual thinking and idea organization.

### Features
- **Infinite Canvas** - Pan and zoom across an unlimited workspace
- **Multiple Item Types** - Memos (rich text), keywords, links, images, videos
- **Visual Connections** - Draw lines between items with labels and arrows
- **Multi-Canvas** - Organize work across multiple canvases with groups
- **Color Coding** - 7 colors for visual categorization and filtering
- **Undo/Redo** - Full history support
- **Light/Dark Theme** - System-aware with manual toggle
- **Offline Support** - Full PWA with service worker caching
- **File System Sync** - Optional local folder sync (Chrome/Edge)

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + F` | Search |
| `Delete` | Delete selected |
| `Escape` | Cancel / Close |
| `Space + Drag` | Pan canvas |
| `Alt + Drag` | Duplicate item |

### Notes
- Data stored in browser (IndexedDB + localStorage)
- Enable File System API in Settings for persistent local storage
- Export backups regularly for important work
