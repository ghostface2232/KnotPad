// KnotPad - UI Module (Unified Entry Point)
// Re-exports all UI functionality from modular structure
//
// Module Structure (Unidirectional Dependencies):
//   ui.js (this file) - Entry point, re-exports
//     └── menus.js - Context menus, Modals, Interactions
//           └── canvas.js - Canvas CRUD, Groups, Rendering, Minimap
//                 └── core.js - Theme, Search, State ops, Auto-save
//
// Optimizations Applied:
// - Event delegation for canvas list (single handler vs per-element)
// - Z-index normalization to prevent overflow
// - Centralized state change via eventBus

// ============ Core Module Exports ============
export {
    loadTheme,
    toggleTheme,
    toggleSearch,
    openSearch,
    closeSearch,
    setupSearchEvents,
    saveState,
    updateUndoRedoButtons,
    normalizeZIndices,
    triggerAutoSave,
    closeSidebarIfUnpinned
} from './ui/core.js';

// ============ Canvas Module Exports ============
export {
    undo,
    redo,
    loadCanvases,
    saveCanvasesList,
    saveCurrentCanvas,
    switchCanvas,
    createNewCanvas,
    deleteCanvas,
    createNewGroup,
    deleteGroup,
    moveCanvasToGroup,
    renderCanvasList,
    setupCanvasListEvents,
    setupCanvasListDropZone,
    setupCanvasIconPicker,
    updateMinimap,
    setupMinimapClick,
    duplicateCanvas,
    collapseAllGroups,
    expandAllGroups
} from './ui/canvas.js';

// ============ Menus Module Exports ============
export {
    showContextMenu,
    setupContextMenu,
    showCanvasContextMenu,
    setupCanvasContextMenu,
    setupSidebarContextMenus,
    bindSidebarContextEvents,
    setupEmptySpaceContextMenu,
    showChildTypePicker,
    setupChildTypePicker,
    showNewNodePicker,
    setupNewNodePicker,
    openLinkModal,
    closeLinkModal,
    setupLinkModal,
    openSettingsModal,
    closeSettingsModal,
    setupSettingsModal,
    applyWrapMode,
    setupSidebarResize,
    handleFile
} from './ui/menus.js';

// ============ Re-exports from items.js ============
export { deleteSelectedItems, deselectAll } from './items.js';

// ============ Initialization Helper ============
// Call this once at app startup to set up all event delegation

import { setupCanvasListEvents, setupCanvasListDropZone, setupCanvasIconPicker, setupMinimapClick } from './ui/canvas.js';
import {
    setupContextMenu,
    setupCanvasContextMenu,
    setupSidebarContextMenus,
    setupEmptySpaceContextMenu,
    setupLinkModal,
    setupSettingsModal,
    setupSidebarResize
} from './ui/menus.js';
import { setupSearchEvents } from './ui/core.js';

export function initializeUI() {
    // Core setup
    setupSearchEvents();

    // Canvas setup
    setupCanvasListEvents();
    setupCanvasListDropZone();
    setupCanvasIconPicker();
    setupMinimapClick();

    // Menus and modals setup
    setupContextMenu();
    setupCanvasContextMenu();
    setupSidebarContextMenus();
    setupEmptySpaceContextMenu();
    setupLinkModal();
    setupSettingsModal();
    setupSidebarResize();
}
