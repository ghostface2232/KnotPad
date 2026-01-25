// KnotPad - Main Entry Point

import { $ } from './utils.js';
import * as state from './state.js';
import { initMediaDB, requestPersistentStorage, tryRestoreFsConnection, reconnectStorageFolder } from './storage.js';
import { updateTransform, setZoom, fitToScreen } from './viewport.js';
import { createItem, addMemo, addKeyword, setFilter, setItemColor, toggleColorGroupMode, positionNewItemInColorGroup } from './items.js';
import {
    setupConnDirectionPicker,
    setupConnectionContextMenu,
    addChildNode,
    startConnection,
    completeConnection,
    cancelConnection,
    updateAllConnections,
    updateConnection,
    deleteConnection
} from './connections.js';
import {
    loadTheme,
    toggleTheme,
    loadCanvases,
    saveCurrentCanvas,
    createNewCanvas,
    createNewGroup,
    updateUndoRedoButtons,
    undo,
    redo,
    saveState,
    triggerAutoSave,
    toggleSearch,
    openLinkModal,
    setupSearchEvents,
    setupCanvasIconPicker,
    setupCanvasListDropZone,
    setupMinimapClick,
    setupContextMenu,
    showContextMenu,
    setupChildTypePicker,
    showChildTypePicker,
    setupNewNodePicker,
    setupLinkModal,
    setupSettingsModal,
    setupCanvasContextMenu,
    setupSidebarContextMenus,
    setupSidebarResize,
    handleFile,
    applyWrapMode,
    applyColorDisplayMode,
    applyLinkPreviewMode,
    startLinkRename
} from './ui.js';
import {
    setupMouseEvents,
    setupTouchEvents,
    setupKeyboardEvents,
    setupDragDropEvents,
    setupCopyEvents,
    setupPasteEvents,
    setupDocumentClickHandler,
    setupGlobalContextMenuBlock
} from './events.js';
import eventBus, { Events } from './events-bus.js';

// ============ Register Event Bus Listeners ============
// This replaces the old setExternalFunctions pattern with a centralized event system

// State management events
eventBus.on(Events.STATE_SAVE, () => saveState());
eventBus.on(Events.AUTOSAVE_TRIGGER, () => triggerAutoSave());

// Connection events
eventBus.on(Events.CONNECTIONS_UPDATE_ALL, () => updateAllConnections());
eventBus.on(Events.CONNECTIONS_UPDATE, (conn) => updateConnection(conn));
eventBus.on(Events.CONNECTIONS_DELETE, (conn, save, withFade) => deleteConnection(conn, save, withFade));
eventBus.on(Events.CONNECTIONS_START, (item, handle) => startConnection(item, handle));
eventBus.on(Events.CONNECTIONS_COMPLETE, (target, handle) => completeConnection(target, handle));
eventBus.on(Events.CONNECTIONS_CANCEL, (withFade) => cancelConnection(withFade));

// UI events
eventBus.on(Events.UI_SHOW_CHILD_TYPE_PICKER, (item, direction, e) => showChildTypePicker(item, direction, e));
eventBus.on(Events.UI_SHOW_CONTEXT_MENU, (x, y, item) => showContextMenu(x, y, item));

// Item events
eventBus.on(Events.ITEMS_ADD_CHILD_NODE, (parent, direction, type) => addChildNode(parent, direction, type));

// Link events
eventBus.on(Events.LINK_RENAME, (item) => startLinkRename(item));

// ============ Setup Toolbar Events ============

function setupToolbarEvents() {
    $('addMemoBtn').addEventListener('click', () => {
        const x = (innerWidth / 2 - state.offsetX) / state.scale - 90;
        const y = (innerHeight / 2 - state.offsetY) / state.scale - 50;
        addMemo('', x, y);
        saveState();
    });

    $('addKeywordBtn').addEventListener('click', () => {
        const x = (innerWidth / 2 - state.offsetX) / state.scale - 60;
        const y = (innerHeight / 2 - state.offsetY) / state.scale - 22;
        addKeyword('', x, y);
        saveState();
    });

    $('addLinkBtn').addEventListener('click', openLinkModal);

    $('addFileBtn').addEventListener('click', () => $('fileInput').click());

    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('searchBtn').addEventListener('click', toggleSearch);
    $('zoomInBtn').addEventListener('click', () => setZoom(state.scale * 1.25));
    $('zoomOutBtn').addEventListener('click', () => setZoom(state.scale / 1.25));
    $('fitViewBtn').addEventListener('click', fitToScreen);
    $('themeToggle').addEventListener('click', toggleTheme);

    $('sortByColorBtn').addEventListener('click', () => {
        toggleColorGroupMode();
    });

    $('fileInput').addEventListener('change', e => {
        if (e.target.files.length) {
            const x = (innerWidth / 2 - state.offsetX) / state.scale - 100;
            const y = (innerHeight / 2 - state.offsetY) / state.scale - 70;
            [...e.target.files].forEach((f, i) => handleFile(f, x + i * 24, y + i * 24));
            $('fileInput').value = '';
        }
    });
}

// ============ Setup Sidebar Events ============

function setupSidebarEvents() {
    const sidebar = $('sidebar');
    const sidebarToggle = $('sidebarToggle');
    const sidebarPinBtn = $('sidebarPinBtn');

    // Restore sidebar open state from localStorage
    if (state.sidebarOpen) {
        sidebar.classList.add('open');
    }

    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        state.setSidebarOpen(sidebar.classList.contains('open'));
    });

    if (state.sidebarPinned) sidebarPinBtn.classList.add('pinned');

    sidebarPinBtn.addEventListener('click', e => {
        e.stopPropagation();
        state.setSidebarPinned(!state.sidebarPinned);
        sidebarPinBtn.classList.toggle('pinned', state.sidebarPinned);
    });

    $('addCanvasBtn').addEventListener('click', async () => {
        await saveCurrentCanvas();
        await createNewCanvas();
    });

    $('addGroupBtn').addEventListener('click', () => {
        createNewGroup();
    });
}

// ============ Setup Filter & Color Dropdown Events ============

function setupFilterColorEvents() {
    const filterDropdown = $('filterDropdown');
    const filterBtn = $('filterBtn');
    const colorDropdown = $('colorDropdown');
    const colorBtn = $('colorBtn');

    filterBtn.addEventListener('click', e => {
        e.stopPropagation();
        colorDropdown.classList.remove('active');
        filterDropdown.classList.toggle('active');
    });

    filterDropdown.querySelectorAll('.filter-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            setFilter(opt.dataset.color);
            // Keep filter dropdown open for continuous filter selection
        });
    });

    colorBtn.addEventListener('click', e => {
        e.stopPropagation();
        filterDropdown.classList.remove('active');
        colorDropdown.classList.toggle('active');
    });

    colorDropdown.querySelectorAll('.color-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            if (state.selectedItems.size > 0) {
                setItemColor([...state.selectedItems][0], opt.dataset.color || null);
            }
            colorDropdown.classList.remove('active');
        });
    });
}

// ============ Setup Import/Export Events ============

function setupImportExportEvents() {
    $('exportBtn').addEventListener('click', async () => {
        const canvases = state.canvases;
        const currentCanvasId = state.currentCanvasId;
        const canvasName = canvases.find(c => c.id === currentCanvasId)?.name || 'canvas';
        const data = {
            items: state.items.map(i => ({
                id: i.id,
                type: i.type,
                x: i.x,
                y: i.y,
                w: i.w,
                h: i.h,
                content: i.content,
                color: i.color,
                fontSize: i.fontSize,
                textAlign: i.textAlign,
                locked: i.locked
            })),
            connections: state.connections.map(c => ({
                from: c.from.id,
                fh: c.fh,
                to: c.to.id,
                th: c.th,
                dir: c.dir,
                label: c.label || ''
            })),
            name: canvasName
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: `${canvasName}.json`,
                    types: [{
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                const { showToast } = await import('./utils.js');
                showToast('Exported');
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
                console.error('Save dialog failed, falling back:', e);
            }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${canvasName}.json`;
        a.click();
        URL.revokeObjectURL(url);
        const { showToast } = await import('./utils.js');
        showToast('Exported');
    });

    $('importBtn').addEventListener('click', () => $('importInput').click());

    $('importInput').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate imported data structure BEFORE clearing state
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid import data: not an object');
            }
            if (!Array.isArray(data.items)) {
                throw new Error('Invalid import data: missing or invalid items array');
            }
            if (!Array.isArray(data.connections)) {
                throw new Error('Invalid import data: missing or invalid connections array');
            }

            // Validate each item has required fields
            for (const item of data.items) {
                if (!item.id || !item.type) {
                    throw new Error('Invalid import data: item missing id or type');
                }
            }

            // Validate each connection references valid item IDs
            const itemIds = new Set(data.items.map(i => i.id));
            for (const conn of data.connections) {
                if (!conn.from || !conn.to) {
                    throw new Error('Invalid import data: connection missing from or to');
                }
                if (!itemIds.has(conn.from) || !itemIds.has(conn.to)) {
                    throw new Error('Invalid import data: connection references non-existent item');
                }
            }

            const { addConnection, updateConnectionArrow, updateConnectionLabel } = await import('./connections.js');
            const { updateMinimap } = await import('./ui.js');

            // Now safe to clear state - validation passed
            state.connections.forEach(c => {
                c.el.remove();
                if (c.hitArea) c.hitArea.remove();
                if (c.arrow) c.arrow.remove();
                if (c.labelEl) c.labelEl.remove();
            });
            state.connections.length = 0;
            state.items.forEach(i => i.el.remove());
            state.items.length = 0;
            state.selectedItems.clear();

            // Calculate maximum item ID from imported items to prevent ID collisions
            let maxImportedItemId = 0;
            data.items.forEach(d => {
                if (d.id) {
                    const match = d.id.match(/^i(\d+)$/);
                    if (match) {
                        const idNum = parseInt(match[1], 10);
                        if (idNum > maxImportedItemId) {
                            maxImportedItemId = idNum;
                        }
                    }
                }
            });
            // Set itemId to the maximum imported ID to prevent collisions
            state.setItemId(maxImportedItemId);
            state.setHighestZ(1);

            const map = {};
            data.items.forEach(d => {
                const i = createItem(d, true);
                map[d.id] = i;
            });

            data.connections.forEach(d => {
                const fromItem = map[d.from];
                const toItem = map[d.to];
                // Validate: both items must exist and must not be the same item (prevent self-connections)
                if (fromItem && toItem && fromItem !== toItem) {
                    const c = addConnection(fromItem, d.fh, toItem, d.th, true);
                    c.dir = d.dir || 'none';
                    c.label = d.label || '';
                    updateConnectionArrow(c);
                    updateConnectionLabel(c);
                }
            });

            updateMinimap();
            saveState();
            triggerAutoSave();
            const { showToast } = await import('./utils.js');
            showToast('Imported');
        } catch (err) {
            console.error('Import failed:', err);
            const { showToast } = await import('./utils.js');
            showToast('Import failed', 'error');
        }
        e.target.value = '';
    });
}

// ============ Initialize Application ============

async function init() {
    // Load theme
    loadTheme();

    // Update initial transform
    updateTransform();

    // Update undo/redo buttons
    updateUndoRedoButtons();

    // Setup all event handlers
    setupToolbarEvents();
    setupSidebarEvents();
    setupSidebarResize();
    setupFilterColorEvents();
    setupImportExportEvents();
    setupSearchEvents();
    setupCanvasIconPicker();
    setupCanvasListDropZone();
    setupConnDirectionPicker();
    setupConnectionContextMenu();
    setupMinimapClick();
    setupContextMenu();
    setupCanvasContextMenu();
    setupSidebarContextMenus();
    setupChildTypePicker();
    setupNewNodePicker();
    setupLinkModal();
    setupSettingsModal();
    applyWrapMode(state.noteWrapMode);
    applyColorDisplayMode(state.colorDisplayMode);
    setupMouseEvents();
    setupTouchEvents();
    setupKeyboardEvents();
    setupDragDropEvents();
    setupCopyEvents();
    setupPasteEvents();
    setupDocumentClickHandler();
    setupGlobalContextMenuBlock();

    // Initialize IndexedDB and load canvases
    try {
        await initMediaDB();
    } catch (e) {
        console.error('IndexedDB init error:', e);
    }

    // Request persistent storage to prevent data loss
    await requestPersistentStorage();

    // Try to restore file system connection from saved handle
    const fsRestoreResult = await tryRestoreFsConnection();
    if (fsRestoreResult === 'needs-permission') {
        // Handle exists but needs permission - setup click handler for reconnection
        const storageIndicator = $('storageIndicator');
        if (storageIndicator) {
            const reconnectHandler = async (e) => {
                e.stopPropagation();
                const success = await reconnectStorageFolder();
                if (success) {
                    storageIndicator.removeEventListener('click', reconnectHandler, true);
                }
            };
            storageIndicator.addEventListener('click', reconnectHandler, true);
        }
    }

    await loadCanvases();

    // Apply link preview mode after items are loaded
    applyLinkPreviewMode(state.linkPreviewEnabled);

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW registration failed:', err));
    }
}

// Start the application
init();
