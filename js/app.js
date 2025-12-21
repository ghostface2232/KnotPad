// KnotPad - Main Entry Point

import { $ } from './utils.js';
import * as state from './state.js';
import { initMediaDB, requestPersistentStorage, tryRestoreFsConnection, reconnectStorageFolder } from './storage.js';
import { updateTransform, setZoom, fitToScreen } from './viewport.js';
import { setExternalFunctions as setItemsExternal, createItem, addMemo, setFilter, setItemColor, sortByColor } from './items.js';
import {
    setExternalFunctions as setConnectionsExternal,
    setupConnDirectionPicker,
    setupConnectionContextMenu,
    addChildNode,
    startConnection,
    completeConnection,
    updateAllConnections,
    updateConnection,
    deleteConnection
} from './connections.js';
import {
    setExternalFunctions as setUIExternal,
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
    handleFile
} from './ui.js';
import {
    setupMouseEvents,
    setupTouchEvents,
    setupKeyboardEvents,
    setupDragDropEvents,
    setupPasteEvents,
    setupDocumentClickHandler
} from './events.js';

// ============ Wire up module dependencies ============

// Set external functions for items module
setItemsExternal({
    updateAllConnections,
    updateConnection,
    deleteConnection,
    saveState,
    triggerAutoSave,
    showChildTypePicker,
    startConnection,
    completeConnection,
    showContextMenu
});

// Set external functions for connections module
setConnectionsExternal({
    saveState,
    triggerAutoSave
});

// Set external functions for UI module
setUIExternal({
    saveState,
    triggerAutoSave,
    addChildNode
});

// ============ Setup Toolbar Events ============

function setupToolbarEvents() {
    $('addMemoBtn').addEventListener('click', () => {
        const x = (innerWidth / 2 - state.offsetX) / state.scale - 90;
        const y = (innerHeight / 2 - state.offsetY) / state.scale - 50;
        addMemo('', x, y);
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
        sortByColor();
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

    sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

    if (state.sidebarPinned) sidebarPinBtn.classList.add('pinned');

    sidebarPinBtn.addEventListener('click', e => {
        e.stopPropagation();
        state.setSidebarPinned(!state.sidebarPinned);
        sidebarPinBtn.classList.toggle('pinned', state.sidebarPinned);
    });

    $('addCanvasBtn').addEventListener('click', () => {
        saveCurrentCanvas();
        createNewCanvas();
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
            filterDropdown.classList.remove('active');
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
                locked: i.locked
            })),
            connections: state.connections.map(c => ({
                from: c.from.id,
                fh: c.fh,
                to: c.to.id,
                th: c.th,
                dir: c.dir
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
            const { addConnection, updateConnectionArrow } = await import('./connections.js');
            const { updateMinimap } = await import('./ui.js');

            state.connections.forEach(c => { c.el.remove(); if (c.arrow) c.arrow.remove(); });
            state.connections.length = 0;
            state.items.forEach(i => i.el.remove());
            state.items.length = 0;
            state.selectedItems.clear();
            state.setItemId(1);
            state.setHighestZ(1);

            const map = {};
            data.items.forEach(d => {
                const i = createItem(d, true);
                map[d.id] = i;
            });

            data.connections.forEach(d => {
                if (map[d.from] && map[d.to]) {
                    const c = addConnection(map[d.from], d.fh, map[d.to], d.th, true);
                    c.dir = d.dir || 'none';
                    updateConnectionArrow(c);
                }
            });

            updateMinimap();
            saveState();
            triggerAutoSave();
            const { showToast } = await import('./utils.js');
            showToast('Imported');
        } catch (err) {
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
    setupChildTypePicker();
    setupNewNodePicker();
    setupLinkModal();
    setupSettingsModal();
    setupMouseEvents();
    setupTouchEvents();
    setupKeyboardEvents();
    setupDragDropEvents();
    setupPasteEvents();
    setupDocumentClickHandler();

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

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW registration failed:', err));
    }
}

// Start the application
init();
