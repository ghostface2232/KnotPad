// KnotPad - UI Module (Toolbar, Menus, Modals, Minimap, Search, Canvas Management)

import { CANVASES_KEY, CANVAS_GROUPS_KEY, THEME_KEY, CANVAS_ICONS, COLOR_MAP, MAX_HISTORY } from './constants.js';
import { $, esc, generateId, showToast } from './utils.js';
import * as state from './state.js';
import { state as reactiveState, peekUndo } from './state.js';
import { updateTransform, throttledMinimap, panToItem, setMinimapUpdateFn } from './viewport.js';
import { createItem, addMemo, addLink, setFilter, deleteSelectedItems, duplicateItem, deselectAll, hideMenus } from './items.js';
import { addConnection, updateConnectionArrow, updateAllConnections, addChildNode } from './connections.js';
import {
    fsDirectoryHandle,
    isFileSystemSupported,
    saveCanvasesListToFileSystem,
    saveCanvasToFileSystem,
    loadCanvasFromFileSystem,
    deleteCanvasFromFileSystem,
    loadMedia,
    loadMediaFromFileSystem,
    saveMedia,
    saveMediaToFileSystem,
    selectStorageFolder,
    disconnectStorageFolder,
    updateStorageIndicator
} from './storage.js';
import eventBus, { Events } from './events-bus.js';

// DOM Elements
const sidebar = $('sidebar');
const canvasList = $('canvasList');
const canvasIconPicker = $('canvasIconPicker');
const searchBar = $('searchBar');
const searchInput = $('searchInput');
const minimapContent = $('minimapContent');
const linkModal = $('linkModal');
const settingsModal = $('settingsModal');
const contextMenu = $('contextMenu');
const canvasContextMenu = $('canvasContextMenu');
const fileInput = $('fileInput');

// Note: External function calls are now handled via eventBus
// Events emitted: STATE_SAVE, AUTOSAVE_TRIGGER
// Events listened: ITEMS_ADD_CHILD_NODE

// ============ Theme ============

export function loadTheme() {
    if (localStorage.getItem(THEME_KEY) === 'light') {
        document.documentElement.classList.add('light');
    }
    updateThemeIcon();
}

export function toggleTheme() {
    document.documentElement.classList.toggle('light');
    localStorage.setItem(THEME_KEY, document.documentElement.classList.contains('light') ? 'light' : 'dark');
    updateThemeIcon();
}

function updateThemeIcon() {
    const isLight = document.documentElement.classList.contains('light');
    $('themeToggle').querySelector('.moon').style.display = isLight ? 'none' : 'block';
    $('themeToggle').querySelector('.sun').style.display = isLight ? 'block' : 'none';
}

// ============ Search ============

export function toggleSearch() {
    if (searchBar.classList.contains('active')) {
        closeSearch();
    } else {
        openSearch();
    }
}

export function openSearch() {
    searchBar.classList.add('active');
    $('searchBtn').classList.add('active');
    searchInput.focus();
}

export function closeSearch() {
    searchBar.classList.remove('active');
    $('searchBtn').classList.remove('active');
    searchInput.value = '';
    clearSearchHighlights();
    state.setSearchResults([]);
    updateSearchCount();
}

function clearSearchHighlights() {
    state.items.forEach(i => i.el.classList.remove('search-highlight'));
}

function doSearch() {
    const q = searchInput.value.toLowerCase().trim();
    clearSearchHighlights();
    state.setSearchResults([]);

    if (!q) {
        updateSearchCount();
        return;
    }

    const results = [];
    state.items.forEach(item => {
        let text = '';
        if (item.type === 'memo') text = (item.content || '').toLowerCase();
        else if (item.type === 'link') text = (item.content.title + ' ' + item.content.url).toLowerCase();
        if (text.includes(q)) results.push(item);
    });

    state.setSearchResults(results);
    state.setSearchIndex(results.length ? 0 : -1);
    updateSearchCount();
    highlightCurrentResult();
}

function updateSearchCount() {
    $('searchCount').textContent = state.searchResults.length
        ? `${state.searchIndex + 1}/${state.searchResults.length}`
        : '0/0';
}

function highlightCurrentResult() {
    clearSearchHighlights();
    if (state.searchIndex >= 0 && state.searchResults[state.searchIndex]) {
        const item = state.searchResults[state.searchIndex];
        item.el.classList.add('search-highlight');
        panToItem(item);
    }
}

export function setupSearchEvents() {
    searchInput.addEventListener('input', doSearch);

    $('searchPrev').addEventListener('click', () => {
        if (state.searchResults.length) {
            state.setSearchIndex((state.searchIndex - 1 + state.searchResults.length) % state.searchResults.length);
            updateSearchCount();
            highlightCurrentResult();
        }
    });

    $('searchNext').addEventListener('click', () => {
        if (state.searchResults.length) {
            state.setSearchIndex((state.searchIndex + 1) % state.searchResults.length);
            updateSearchCount();
            highlightCurrentResult();
        }
    });

    $('searchClose').addEventListener('click', closeSearch);
}

// ============ Undo/Redo ============

export function saveState() {
    const stateData = {
        items: state.items.map(i => ({
            id: i.id,
            type: i.type,
            x: i.x,
            y: i.y,
            w: i.w,
            h: i.h,
            content: JSON.parse(JSON.stringify(i.content)),
            color: i.color,
            fontSize: i.fontSize,
            locked: i.locked,
            manuallyResized: i.manuallyResized,
            z: parseInt(i.el.style.zIndex)
        })),
        connections: state.connections.map(c => ({
            id: c.id,
            from: c.from.id,
            fh: c.fh,
            to: c.to.id,
            th: c.th,
            dir: c.dir
        }))
    };

    // Prevent duplicate states - compare with last state
    const lastState = peekUndo();
    if (lastState) {
        // Compare serialized versions for equality check
        const lastStr = JSON.stringify(lastState);
        const currentStr = JSON.stringify(stateData);
        if (lastStr === currentStr) {
            return;
        }
    }

    // Store structured object directly (not JSON string)
    state.pushUndo(stateData);
    if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
    state.clearRedo();
    updateUndoRedoButtons();
}

export function updateUndoRedoButtons() {
    const undoBtn = $('undoBtn');
    const redoBtn = $('redoBtn');
    undoBtn.disabled = state.undoStack.length < 2;
    redoBtn.disabled = state.redoStack.length === 0;
    undoBtn.classList.toggle('disabled', state.undoStack.length < 2);
    redoBtn.classList.toggle('disabled', state.redoStack.length === 0);
}

export function undo() {
    if (state.undoStack.length < 2) return;
    state.pushRedo(state.popUndo());
    // State is now stored as structured object, not JSON string
    restoreState(state.undoStack[state.undoStack.length - 1]);
    updateUndoRedoButtons();
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

export function redo() {
    if (!state.redoStack.length) return;
    const stateData = state.popRedo();
    state.pushUndo(stateData);
    // State is now stored as structured object, not JSON string
    restoreState(stateData);
    updateUndoRedoButtons();
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

function restoreState(stateData) {
    state.connections.forEach(c => { c.el.remove(); if (c.hitArea) c.hitArea.remove(); if (c.arrow) c.arrow.remove(); });
    state.connections.length = 0;
    state.items.forEach(i => i.el.remove());
    state.items.length = 0;
    state.selectedItems.clear();
    state.setSelectedConn(null);

    const map = {};
    stateData.items.forEach(d => {
        if ((d.type === 'image' || d.type === 'video') && d.content?.startsWith('media_') && !state.blobURLCache.has(d.content)) return;
        const i = createItem(d, true);
        i.el.style.zIndex = d.z || 1;
        i.locked = d.locked;
        i.manuallyResized = d.manuallyResized || false;
        if (i.locked) i.el.classList.add('locked');
        map[d.id] = i;
    });

    stateData.connections.forEach(d => {
        if (map[d.from] && map[d.to]) {
            const c = addConnection(map[d.from], d.fh, map[d.to], d.th, true);
            c.dir = d.dir || 'none';
            updateConnectionArrow(c);
        }
    });

    updateMinimap();
}

// ============ Canvas Management ============

export async function loadCanvases() {
    try {
        state.setCanvases(JSON.parse(localStorage.getItem(CANVASES_KEY) || '[]'));
        state.setCanvasGroups(JSON.parse(localStorage.getItem(CANVAS_GROUPS_KEY) || '[]'));
        if (!state.canvases.length) {
            state.setCanvases([{ id: generateId(), name: 'Untitled', createdAt: Date.now(), itemCount: 0 }]);
        }
        saveCanvasesList();
        const lastId = localStorage.getItem('knotpad-active-canvas');
        const target = state.canvases.find(c => c.id === lastId) || state.canvases[0];
        if (target) await switchCanvas(target.id);
        renderCanvasList();
    } catch (e) {
        console.error(e);
    }
}

export function saveCanvasesList() {
    localStorage.setItem(CANVASES_KEY, JSON.stringify(state.canvases));
    localStorage.setItem(CANVAS_GROUPS_KEY, JSON.stringify(state.canvasGroups));
    if (fsDirectoryHandle) {
        saveCanvasesListToFileSystem();
    }
}

export async function saveCurrentCanvas() {
    if (!state.currentCanvasId) return;
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
            locked: i.locked,
            manuallyResized: i.manuallyResized,
            z: parseInt(i.el.style.zIndex)
        })),
        connections: state.connections.map(c => ({
            id: c.id,
            from: c.from.id,
            fh: c.fh,
            to: c.to.id,
            th: c.th,
            dir: c.dir
        })),
        view: { scale: state.scale, offsetX: state.offsetX, offsetY: state.offsetY },
        itemId: state.itemId,
        highestZ: state.highestZ
    };

    try {
        localStorage.setItem('knotpad-data-' + state.currentCanvasId, JSON.stringify(data));
        if (fsDirectoryHandle) {
            await saveCanvasToFileSystem(state.currentCanvasId, data);
        }
        const c = state.canvases.find(x => x.id === state.currentCanvasId);
        if (c) {
            c.updatedAt = Date.now();
            c.itemCount = state.items.length;
            saveCanvasesList();
            renderCanvasList();
        }
    } catch (e) {
        showToast('Save failed', 'error');
    }
}

async function loadCanvasData(id) {
    try {
        let data = null;
        if (fsDirectoryHandle) {
            data = await loadCanvasFromFileSystem(id);
        }
        if (!data) {
            const saved = localStorage.getItem('knotpad-data-' + id);
            if (!saved) return;
            data = JSON.parse(saved);
        }

        state.setItemId(data.itemId || 0);
        state.setHighestZ(data.highestZ || 1);

        if (data.view) {
            state.setScale(data.view.scale);
            state.setOffsetX(data.view.offsetX);
            state.setOffsetY(data.view.offsetY);
            updateTransform();
        }

        // Load media with retry logic for better persistence
        const mediaItems = data.items.filter(d => (d.type === 'image' || d.type === 'video') && d.content?.startsWith('media_'));
        const loadMediaWithRetry = async (mediaId, retries = 2) => {
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    let blob = null;
                    if (fsDirectoryHandle) {
                        blob = await loadMediaFromFileSystem(mediaId);
                    }
                    if (!blob) {
                        blob = await loadMedia(mediaId);
                    }
                    if (blob) {
                        state.blobURLCache.set(mediaId, URL.createObjectURL(blob));
                        return true;
                    }
                } catch (e) {
                    console.warn(`Media load attempt ${attempt + 1} failed for ${mediaId}:`, e);
                }
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                }
            }
            console.warn(`Failed to load media after retries: ${mediaId}`);
            return false;
        };

        // Load all media in parallel for better performance
        await Promise.all(mediaItems.map(d => {
            if (!state.blobURLCache.has(d.content)) {
                return loadMediaWithRetry(d.content);
            }
            return Promise.resolve(true);
        }));

        const map = {};
        data.items.forEach(d => {
            const i = createItem(d, true);
            i.el.style.zIndex = d.z || 1;
            i.locked = d.locked;
            i.manuallyResized = d.manuallyResized || false;
            if (i.locked) i.el.classList.add('locked');
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
        // Store structured object directly (not JSON string)
        state.setUndoStack([{ items: data.items, connections: data.connections.map(c => ({ ...c })) }]);
        state.setRedoStack([]);
        updateUndoRedoButtons();
    } catch (e) {
        console.error(e);
    }
}

export async function switchCanvas(id) {
    state.blobURLCache.forEach(url => URL.revokeObjectURL(url));
    state.blobURLCache.clear();
    state.connections.forEach(c => { c.el.remove(); if (c.hitArea) c.hitArea.remove(); if (c.arrow) c.arrow.remove(); });
    state.connections.length = 0;
    state.items.forEach(i => i.el.remove());
    state.items.length = 0;
    state.selectedItems.clear();
    state.setSelectedConn(null);
    state.setItemId(1);
    state.setHighestZ(1);
    state.setScale(1);
    state.setOffsetX(0);
    state.setOffsetY(0);
    state.setUndoStack([]);
    state.setRedoStack([]);
    updateTransform();

    state.setCurrentCanvasId(id);
    localStorage.setItem('knotpad-active-canvas', id);
    await loadCanvasData(id);

    if (!state.undoStack.length) {
        // Store structured object directly (not JSON string)
        state.setUndoStack([{ items: [], connections: [] }]);
    }
    updateUndoRedoButtons();
    setFilter('all');
    updateMinimap();
    renderCanvasList();
    updateTopbarCanvasName();
}

export async function createNewCanvas(groupId = null) {
    const nc = { id: generateId(), name: 'Untitled', createdAt: Date.now(), itemCount: 0, groupId: groupId };
    if (groupId) {
        // Add to end of group
        const groupCanvases = state.canvases.filter(c => c.groupId === groupId);
        const lastGroupCanvas = groupCanvases[groupCanvases.length - 1];
        const insertIndex = lastGroupCanvas ? state.canvases.indexOf(lastGroupCanvas) + 1 : state.canvases.length;
        state.canvases.splice(insertIndex, 0, nc);
    } else {
        state.canvases.unshift(nc);
    }
    saveCanvasesList();
    await switchCanvas(nc.id);
}

// ============ Canvas Group Management ============

export function createNewGroup() {
    const ng = { id: generateId(), name: 'New Group', createdAt: Date.now() };
    state.canvasGroups.push(ng);
    saveCanvasesList();
    renderCanvasList();
    // Start renaming immediately
    setTimeout(() => {
        const header = canvasList.querySelector(`.canvas-group[data-group-id="${ng.id}"] .canvas-group-header`);
        if (header) startGroupRename(header, ng.id);
    }, 50);
}

export function deleteGroup(groupId) {
    if (!confirm('Delete this group? Canvases inside will be moved out.')) return;

    // Remove group assignment from canvases
    state.canvases.forEach(c => {
        if (c.groupId === groupId) c.groupId = null;
    });

    // Remove the group
    const idx = state.canvasGroups.findIndex(g => g.id === groupId);
    if (idx > -1) {
        state.canvasGroups.splice(idx, 1);
        saveCanvasesList();
        renderCanvasList();
        showToast('Group deleted');
    }
}

function renameGroup(groupId, name) {
    const g = state.canvasGroups.find(x => x.id === groupId);
    if (g) {
        g.name = name || 'Untitled Group';
        saveCanvasesList();
        renderCanvasList();
    }
}

function startGroupRename(header, groupId) {
    const nameEl = header.querySelector('.group-name');
    const oldName = state.canvasGroups.find(g => g.id === groupId)?.name || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'group-name-input';
    input.value = oldName;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => renameGroup(groupId, input.value.trim() || 'Untitled Group');
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = oldName; input.blur(); }
    });
}

function moveCanvasToGroup(canvasId, groupId) {
    const canvas = state.canvases.find(c => c.id === canvasId);
    if (canvas) {
        canvas.groupId = groupId || null;
        saveCanvasesList();
        renderCanvasList();
    }
}

export async function deleteCanvas(id) {
    if (state.canvases.length <= 1) {
        showToast('Cannot delete last canvas', 'error');
        return;
    }
    if (!confirm('Delete this canvas?')) return;

    const idx = state.canvases.findIndex(c => c.id === id);
    if (idx > -1) {
        state.canvases.splice(idx, 1);
        localStorage.removeItem('knotpad-data-' + id);
        if (fsDirectoryHandle) {
            await deleteCanvasFromFileSystem(id);
        }
        saveCanvasesList();
        if (state.currentCanvasId === id) await switchCanvas(state.canvases[0].id);
        else renderCanvasList();
        showToast('Canvas deleted');
    }
}

function renameCanvas(id, name) {
    const c = state.canvases.find(x => x.id === id);
    if (c) {
        c.name = name || 'Untitled';
        c.updatedAt = Date.now();
        saveCanvasesList();
        renderCanvasList();
        updateTopbarCanvasName();
    }
}

function updateTopbarCanvasName() {
    const c = state.canvases.find(x => x.id === state.currentCanvasId);
    $('topbarCanvasName').textContent = c?.name || 'Untitled';
}

function getCanvasIconHTML(c) {
    if (c.icon && CANVAS_ICONS[c.icon]) return CANVAS_ICONS[c.icon];
    return `<span class="icon-letter">${esc((c.name || 'U').charAt(0).toUpperCase())}</span>`;
}

function getCanvasIconStyle(c, isActive) {
    if (c.color && COLOR_MAP[c.color]) {
        // For colored canvas, use color as background with adjusted opacity
        return `background: ${COLOR_MAP[c.color]}${isActive ? '' : '33'}; ${isActive ? 'color: white;' : `color: ${COLOR_MAP[c.color]};`}`;
    }
    return '';
}

function formatRelativeDate(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderCanvasEntry(c) {
    const isActive = c.id === state.currentCanvasId;
    const iconStyle = getCanvasIconStyle(c, isActive);
    const lastModified = formatRelativeDate(c.updatedAt || c.createdAt);
    const metaText = `${c.itemCount || 0} items${lastModified ? ` · ${lastModified}` : ''}`;
    return `
        <div class="canvas-item-entry ${isActive ? 'active' : ''}${c.color ? ' has-color' : ''}" data-id="${c.id}" draggable="true">
            <div class="canvas-icon${c.color ? ' colored' : ''}" data-canvas-id="${c.id}" style="${iconStyle}">${getCanvasIconHTML(c)}</div>
            <div class="canvas-info">
                <div class="canvas-name">${esc(c.name)}</div>
                <div class="canvas-meta">${metaText}</div>
            </div>
            <div class="canvas-actions">
                <button class="canvas-action-btn rename" title="Rename">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="canvas-action-btn delete" title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function renderGroupHTML(group, canvasesInGroup) {
    const isCollapsed = state.collapsedGroups.has(group.id);
    return `
        <div class="canvas-group ${isCollapsed ? 'collapsed' : ''}" data-group-id="${group.id}">
            <div class="canvas-group-header" data-group-id="${group.id}">
                <svg class="group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                <span class="group-name">${esc(group.name)}</span>
                <div class="group-right">
                    <span class="group-count">${canvasesInGroup.length}</span>
                    <div class="group-actions">
                        <button class="group-action-btn add" title="Add Canvas">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
                        </button>
                        <button class="group-action-btn rename" title="Rename">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="group-action-btn delete" title="Delete Group">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="canvas-group-content">
                ${canvasesInGroup.map(c => renderCanvasEntry(c)).join('')}
            </div>
        </div>
    `;
}

export function renderCanvasList() {
    // Separate canvases by group
    const ungroupedCanvases = state.canvases.filter(c => !c.groupId);
    const groupedCanvasMap = new Map();

    state.canvasGroups.forEach(g => {
        groupedCanvasMap.set(g.id, state.canvases.filter(c => c.groupId === g.id));
    });

    let html = '';

    // Render ungrouped canvases first
    ungroupedCanvases.forEach(c => {
        html += renderCanvasEntry(c);
    });

    // Render groups
    state.canvasGroups.forEach(group => {
        const canvasesInGroup = groupedCanvasMap.get(group.id) || [];
        html += renderGroupHTML(group, canvasesInGroup);
    });

    canvasList.innerHTML = html;

    // Bind canvas entry events
    canvasList.querySelectorAll('.canvas-item-entry').forEach(entry => {
        const id = entry.dataset.id;
        entry.addEventListener('click', async e => {
            if (!e.target.closest('.canvas-action-btn') && !e.target.closest('.canvas-icon') && id !== state.currentCanvasId) {
                saveCurrentCanvas();
                await switchCanvas(id);
            }
        });
        entry.querySelector('.rename').addEventListener('click', e => { e.stopPropagation(); startRename(entry, id); });
        entry.querySelector('.delete').addEventListener('click', e => { e.stopPropagation(); deleteCanvas(id); });
        entry.querySelector('.canvas-icon').addEventListener('click', e => { e.stopPropagation(); openIconPicker(id, entry); });

        // Drag and drop for canvases
        setupCanvasDragDrop(entry, id);
    });

    // Bind group events
    canvasList.querySelectorAll('.canvas-group').forEach(groupEl => {
        const groupId = groupEl.dataset.groupId;
        const header = groupEl.querySelector('.canvas-group-header');

        // Toggle collapse
        header.addEventListener('click', e => {
            if (!e.target.closest('.group-action-btn')) {
                state.toggleGroupCollapsed(groupId);
                groupEl.classList.toggle('collapsed');
            }
        });

        // Group actions
        header.querySelector('.group-action-btn.add')?.addEventListener('click', e => {
            e.stopPropagation();
            createNewCanvas(groupId);
        });
        header.querySelector('.group-action-btn.rename')?.addEventListener('click', e => {
            e.stopPropagation();
            startGroupRename(header, groupId);
        });
        header.querySelector('.group-action-btn.delete')?.addEventListener('click', e => {
            e.stopPropagation();
            deleteGroup(groupId);
        });

        // Drag drop for groups
        setupGroupDragDrop(header, groupId);
    });
}

function setupCanvasDragDrop(entry, canvasId) {
    entry.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', canvasId);
        e.dataTransfer.effectAllowed = 'move';
        entry.classList.add('dragging');
        canvasList.classList.add('drag-active');
        // Small delay to ensure drag image is captured
        setTimeout(() => {
            entry.style.opacity = '0.4';
        }, 0);
    });

    entry.addEventListener('dragend', () => {
        entry.classList.remove('dragging');
        entry.style.opacity = '';
        canvasList.classList.remove('drag-active');
        canvasList.querySelectorAll('.drag-over, .drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });
    });

    entry.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        if (entry.classList.contains('dragging')) return;

        // Determine if dropping above or below based on mouse position
        const rect = entry.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isAbove = e.clientY < midY;

        entry.classList.remove('drag-over-top', 'drag-over-bottom');
        entry.classList.add(isAbove ? 'drag-over-top' : 'drag-over-bottom');
    });

    entry.addEventListener('dragenter', e => {
        e.preventDefault();
        e.stopPropagation();
    });

    entry.addEventListener('dragleave', e => {
        // Only remove classes if leaving to outside the entry
        const relatedTarget = e.relatedTarget;
        if (!entry.contains(relatedTarget)) {
            entry.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        }
    });

    entry.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();

        const isAbove = entry.classList.contains('drag-over-top');
        entry.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');

        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== canvasId) {
            reorderCanvas(draggedId, canvasId, isAbove);
        }
    });
}

function setupGroupDragDrop(header, groupId) {
    header.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });

    header.addEventListener('dragenter', e => {
        e.preventDefault();
        header.classList.add('drag-over');
    });

    header.addEventListener('dragleave', () => {
        header.classList.remove('drag-over');
    });

    header.addEventListener('drop', e => {
        e.preventDefault();
        header.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId) {
            moveCanvasToGroup(draggedId, groupId);
        }
    });
}

function reorderCanvas(draggedId, targetId, insertBefore = false) {
    const draggedIdx = state.canvases.findIndex(c => c.id === draggedId);
    const targetIdx = state.canvases.findIndex(c => c.id === targetId);

    if (draggedIdx === -1 || targetIdx === -1 || draggedIdx === targetIdx) return;

    const targetCanvas = state.canvases[targetIdx];
    const [draggedCanvas] = state.canvases.splice(draggedIdx, 1);
    // Match target's group
    draggedCanvas.groupId = targetCanvas.groupId || null;

    // Find where target is now after removal
    const newTargetIdx = state.canvases.findIndex(c => c.id === targetId);
    // Insert before or after based on drop position
    const insertIdx = insertBefore ? newTargetIdx : newTargetIdx + 1;
    state.canvases.splice(insertIdx, 0, draggedCanvas);

    saveCanvasesList();
    renderCanvasList();
}

// Setup drop zone on canvas list for removing from groups
export function setupCanvasListDropZone() {
    canvasList.addEventListener('dragover', e => {
        // Only handle drops directly on the list, not on items
        if (e.target === canvasList) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });

    canvasList.addEventListener('drop', e => {
        if (e.target === canvasList) {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId) {
                // Move canvas out of any group to ungrouped
                moveCanvasToGroup(draggedId, null);
            }
        }
    });
}

function startRename(entry, id) {
    const nameEl = entry.querySelector('.canvas-name');
    const oldName = state.canvases.find(c => c.id === id)?.name || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'canvas-name-input';
    input.value = oldName;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    // Disable drag while editing to allow text selection
    entry.draggable = false;

    const finish = () => {
        entry.draggable = true; // Restore drag capability
        renameCanvas(id, input.value.trim() || 'Untitled');
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = oldName; input.blur(); }
    });
}

function openIconPicker(canvasId, entry) {
    state.setIconPickerTarget(canvasId);
    const canvas = state.canvases.find(c => c.id === canvasId);
    const rect = entry.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();

    // Position popup below the thumbnail entry, not covering it
    const pickerHeight = 180; // Approximate height of the picker
    const spaceBelow = sidebarRect.bottom - rect.bottom;
    const spaceAbove = rect.top - sidebarRect.top;

    if (spaceBelow >= pickerHeight || spaceBelow >= spaceAbove) {
        // Position below the entry
        canvasIconPicker.style.top = (rect.bottom - sidebarRect.top + 4) + 'px';
        canvasIconPicker.style.bottom = '';
    } else {
        // Position above the entry if not enough space below
        canvasIconPicker.style.top = '';
        canvasIconPicker.style.bottom = (sidebarRect.bottom - rect.top + 4) + 'px';
    }

    // Update icon selection state
    canvasIconPicker.querySelectorAll('.icon-opt').forEach(opt =>
        opt.classList.toggle('selected', opt.dataset.icon === (canvas?.icon || ''))
    );

    // Update color selection state
    canvasIconPicker.querySelectorAll('.canvas-color-opt').forEach(opt =>
        opt.classList.toggle('selected', opt.dataset.color === (canvas?.color || ''))
    );

    canvasIconPicker.classList.add('active');
}

function setCanvasIcon(canvasId, icon) {
    const c = state.canvases.find(x => x.id === canvasId);
    if (c) {
        c.icon = icon || null;
        c.updatedAt = Date.now();
        saveCanvasesList();
        renderCanvasList();
        // Update picker selection state in real-time
        canvasIconPicker.querySelectorAll('.icon-opt').forEach(opt =>
            opt.classList.toggle('selected', opt.dataset.icon === (icon || ''))
        );
    }
}

function setCanvasColor(canvasId, color) {
    const c = state.canvases.find(x => x.id === canvasId);
    if (c) {
        c.color = color || null;
        c.updatedAt = Date.now();
        saveCanvasesList();
        renderCanvasList();
        // Update picker selection state in real-time
        canvasIconPicker.querySelectorAll('.canvas-color-opt').forEach(opt =>
            opt.classList.toggle('selected', opt.dataset.color === (color || ''))
        );
    }
}

export function setupCanvasIconPicker() {
    // Icon selection
    canvasIconPicker.querySelectorAll('.icon-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            if (state.iconPickerTarget) setCanvasIcon(state.iconPickerTarget, opt.dataset.icon);
        });
    });

    // Color selection
    canvasIconPicker.querySelectorAll('.canvas-color-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            if (state.iconPickerTarget) setCanvasColor(state.iconPickerTarget, opt.dataset.color);
        });
    });

    // Close picker when clicking outside
    document.addEventListener('click', e => {
        if (canvasIconPicker.classList.contains('active') &&
            !canvasIconPicker.contains(e.target) &&
            !e.target.closest('.canvas-icon')) {
            canvasIconPicker.classList.remove('active');
            state.setIconPickerTarget(null);
        }
    });

    // Prevent clicks inside picker from closing it
    canvasIconPicker.addEventListener('click', e => {
        e.stopPropagation();
    });
}

// ============ Minimap ============

export function updateMinimap() {
    const visible = state.items.filter(i => !i.el.classList.contains('filtered-out'));
    if (!visible.length) {
        minimapContent.innerHTML = '<div class="minimap-viewport"></div>';
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visible.forEach(i => {
        minX = Math.min(minX, i.x);
        minY = Math.min(minY, i.y);
        maxX = Math.max(maxX, i.x + i.w);
        maxY = Math.max(maxY, i.y + i.h);
    });

    minX -= 80; minY -= 80; maxX += 80; maxY += 80;
    const s = Math.min(160 / (maxX - minX), 100 / (maxY - minY));

    let html = '<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">';
    state.connections.forEach(c => {
        if (c.from.el.classList.contains('filtered-out') || c.to.el.classList.contains('filtered-out')) return;
        const fx = (c.from.x + c.from.w / 2 - minX) * s;
        const fy = (c.from.y + c.from.h / 2 - minY) * s;
        const tx = (c.to.x + c.to.w / 2 - minX) * s;
        const ty = (c.to.y + c.to.h / 2 - minY) * s;
        html += `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="var(--accent-dim)" stroke-width="1"/>`;
    });
    html += '</svg>';

    visible.forEach(i => {
        const bg = i.color ? COLOR_MAP[i.color] : 'var(--text-secondary)';
        html += `<div class="minimap-item" style="left:${(i.x - minX) * s}px;top:${(i.y - minY) * s}px;width:${Math.max(3, i.w * s)}px;height:${Math.max(2, i.h * s)}px;background:${bg}"></div>`;
    });

    const vx = (-state.offsetX / state.scale - minX) * s;
    const vy = (-state.offsetY / state.scale - minY) * s;
    html += `<div class="minimap-viewport" style="left:${vx}px;top:${vy}px;width:${innerWidth / state.scale * s}px;height:${innerHeight / state.scale * s}px"></div>`;

    minimapContent.innerHTML = html;
}

// Register minimap update function
setMinimapUpdateFn(updateMinimap);

export function setupMinimapClick() {
    $('minimap').addEventListener('click', e => {
        if (!state.items.length) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        state.items.forEach(i => {
            minX = Math.min(minX, i.x);
            minY = Math.min(minY, i.y);
            maxX = Math.max(maxX, i.x + i.w);
            maxY = Math.max(maxY, i.y + i.h);
        });

        minX -= 80; minY -= 80; maxX += 80; maxY += 80;
        const rect = $('minimap').getBoundingClientRect();
        const sx = (maxX - minX) / 160;
        const sy = (maxY - minY) / 100;
        const clickX = (e.clientX - rect.left) * sx + minX;
        const clickY = (e.clientY - rect.top) * sy + minY;
        const targetX = innerWidth / 2 - clickX * state.scale;
        const targetY = innerHeight / 2 - clickY * state.scale;
        const startX = state.offsetX;
        const startY = state.offsetY;
        const startTime = performance.now();
        const duration = 200;

        function animate(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            state.setOffsetX(startX + (targetX - startX) * ease);
            state.setOffsetY(startY + (targetY - startY) * ease);
            updateTransform();
            if (t < 1) requestAnimationFrame(animate);
            else updateMinimap();
        }
        requestAnimationFrame(animate);
    });
}

// ============ Context Menu ============

export function showContextMenu(x, y, item) {
    contextMenu.querySelector('[data-action="lock"]').textContent = item.locked ? 'Unlock' : 'Lock to Back';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('active');
}

export function setupContextMenu() {
    contextMenu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', () => {
            if (window.selectedItem) {
                switch (el.dataset.action) {
                    case 'duplicate':
                        duplicateItem(window.selectedItem);
                        break;
                    case 'lock':
                        window.selectedItem.locked = !window.selectedItem.locked;
                        window.selectedItem.el.classList.toggle('locked', window.selectedItem.locked);
                        if (window.selectedItem.locked) window.selectedItem.el.style.zIndex = 1;
                        eventBus.emit(Events.STATE_SAVE);
                        eventBus.emit(Events.AUTOSAVE_TRIGGER);
                        break;
                    case 'delete':
                        if (state.selectedItems.size > 0) deleteSelectedItems();
                        else deleteItem(window.selectedItem);
                        break;
                }
            }
            hideMenus();
        });
    });
}

// ============ Canvas Context Menu ============

let canvasContextX = 0;
let canvasContextY = 0;

export function showCanvasContextMenu(clientX, clientY, canvasX, canvasY) {
    canvasContextX = canvasX;
    canvasContextY = canvasY;

    // Update check states
    const gridSnapCheck = $('gridSnapCheck');
    const invertZoomCheck = $('invertZoomCheck');
    if (gridSnapCheck) {
        gridSnapCheck.classList.toggle('checked', state.gridSnap);
    }
    if (invertZoomCheck) {
        invertZoomCheck.classList.toggle('checked', state.invertWheelZoom);
    }

    canvasContextMenu.style.left = clientX + 'px';
    canvasContextMenu.style.top = clientY + 'px';
    canvasContextMenu.classList.add('active');
}

export function setupCanvasContextMenu() {
    canvasContextMenu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', () => {
            switch (el.dataset.action) {
                case 'new-memo':
                    addMemo('', canvasContextX, canvasContextY);
                    eventBus.emit(Events.STATE_SAVE);
                    break;
                case 'new-link':
                    openLinkModal();
                    break;
                case 'new-image':
                    fileInput.click();
                    break;
                case 'grid-snap':
                    state.setGridSnap(!state.gridSnap);
                    $('gridSnapCheck').classList.toggle('checked', state.gridSnap);
                    break;
                case 'invert-zoom':
                    state.setInvertWheelZoom(!state.invertWheelZoom);
                    $('invertZoomCheck').classList.toggle('checked', state.invertWheelZoom);
                    break;
            }
            canvasContextMenu.classList.remove('active');
        });
    });
}

// ============ Child Type Picker (Direct Memo Creation) ============

export function showChildTypePicker(parentItem, direction, e) {
    // Create memo directly without popup
    addChildNode(parentItem, direction, 'memo');
}

export function setupChildTypePicker() {
    // No longer needed - memo is created directly
}

// ============ New Node Picker (Direct Memo Creation) ============

export function showNewNodePicker(clientX, clientY, canvasX, canvasY) {
    // Create memo directly without popup
    addMemo('', canvasX, canvasY);
    eventBus.emit(Events.STATE_SAVE);
}

export function setupNewNodePicker() {
    // No longer needed - memo is created directly
}

// ============ Link Modal ============

export function openLinkModal() {
    linkModal.classList.add('active');
    setTimeout(() => $('linkUrl').focus(), 100);
}

export function closeLinkModal() {
    linkModal.classList.remove('active');
    $('linkTitle').value = '';
    $('linkUrl').value = '';
}

export function setupLinkModal() {
    linkModal.addEventListener('click', e => { if (e.target === linkModal) closeLinkModal(); });
    linkModal.querySelector('[data-close]').addEventListener('click', closeLinkModal);

    $('linkSubmit').addEventListener('click', () => {
        let url = $('linkUrl').value.trim();
        if (url) {
            if (!url.startsWith('http')) url = 'https://' + url;
            const x = (innerWidth / 2 - state.offsetX) / state.scale - 130;
            const y = (innerHeight / 2 - state.offsetY) / state.scale - 50;
            addLink(url, $('linkTitle').value.trim(), x, y);
            eventBus.emit(Events.STATE_SAVE);
            closeLinkModal();
        }
    });
}

// ============ Settings Modal ============

export function openSettingsModal() {
    if (settingsModal) {
        updateStorageModalState();
        updateSettingsUI();
        settingsModal.classList.add('active');
    }
}

export function closeSettingsModal() {
    if (settingsModal) settingsModal.classList.remove('active');
}

function updateStorageModalState() {
    const connected = !!fsDirectoryHandle;
    const browserCard = $('browserStorageCard');
    const fileCard = $('fileStorageCard');
    const fileStorageBadge = $('fileStorageBadge');

    // Update cards active state
    if (browserCard && fileCard) {
        if (connected) {
            browserCard.classList.remove('active');
            fileCard.classList.add('active');
        } else {
            browserCard.classList.add('active');
            fileCard.classList.remove('active');
        }
    }

    // Update badge with folder name
    if (fileStorageBadge) {
        if (connected) {
            const folderName = fsDirectoryHandle?.name || 'Connected';
            fileStorageBadge.textContent = folderName;
            fileStorageBadge.classList.remove('disconnected');
        } else {
            fileStorageBadge.textContent = 'Not Connected';
            fileStorageBadge.classList.add('disconnected');
        }
    }
}

function updateFontSizePreview(size) {
    const previewText = $('previewText');
    if (previewText) {
        previewText.className = 'preview-text size-' + size;
    }
}

function updateSettingsUI() {
    // Update font size buttons
    const fontSizeGroup = $('defaultFontSize');
    if (fontSizeGroup) {
        fontSizeGroup.querySelectorAll('.settings-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === state.defaultFontSize);
        });
    }

    // Update font size preview
    updateFontSizePreview(state.defaultFontSize);

    // Update invert wheel zoom toggle
    const invertWheelZoomCheckbox = $('invertWheelZoom');
    if (invertWheelZoomCheckbox) {
        invertWheelZoomCheckbox.checked = state.invertWheelZoom;
    }

    // Update grid snap toggle
    const gridSnapCheckbox = $('gridSnapToggle');
    if (gridSnapCheckbox) {
        gridSnapCheckbox.checked = state.gridSnap;
    }
}

export function setupSettingsModal() {
    const settingsBtn = $('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettingsModal);
    }

    if (settingsModal) {
        settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettingsModal(); });
        const closeBtn = settingsModal.querySelector('[data-close]');
        if (closeBtn) closeBtn.addEventListener('click', closeSettingsModal);

        // Tab switching
        settingsModal.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                settingsModal.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                settingsModal.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = settingsModal.querySelector(`.settings-panel[data-panel="${tab.dataset.tab}"]`);
                if (panel) panel.classList.add('active');
            });
        });
    }

    // Storage card selection
    const browserCard = $('browserStorageCard');
    const fileCard = $('fileStorageCard');

    // Disable File Storage card if File System API is not supported
    if (fileCard && !isFileSystemSupported()) {
        fileCard.classList.add('disabled');
        fileCard.title = 'File System API is not supported in this browser. Use Chrome, Edge, or Opera.';
        const desc = fileCard.querySelector('.storage-card-desc');
        if (desc) desc.textContent = 'Not supported in this browser';
    }

    if (browserCard) {
        browserCard.addEventListener('click', async () => {
            if (fsDirectoryHandle) {
                await disconnectStorageFolder();
                updateStorageModalState();
            }
        });
    }

    if (fileCard) {
        fileCard.addEventListener('click', async () => {
            // Don't allow selection if disabled (API not supported)
            if (fileCard.classList.contains('disabled')) return;
            // Immediately open folder picker
            const success = await selectStorageFolder();
            if (success) {
                updateStorageModalState();
            }
        });
    }

    // Export all canvases
    const exportAllBtn = $('exportAllBtn');
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', exportAllCanvases);
    }

    // Default font size
    const fontSizeGroup = $('defaultFontSize');
    if (fontSizeGroup) {
        fontSizeGroup.querySelectorAll('.settings-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                fontSizeGroup.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.setDefaultFontSize(btn.dataset.value);
                updateFontSizePreview(btn.dataset.value);
            });
        });
    }

    // Invert wheel zoom
    const invertWheelZoomCheckbox = $('invertWheelZoom');
    if (invertWheelZoomCheckbox) {
        invertWheelZoomCheckbox.addEventListener('change', () => {
            state.setInvertWheelZoom(invertWheelZoomCheckbox.checked);
        });
    }

    // Grid snap
    const gridSnapCheckbox = $('gridSnapToggle');
    if (gridSnapCheckbox) {
        gridSnapCheckbox.addEventListener('change', () => {
            state.setGridSnap(gridSnapCheckbox.checked);
        });
    }
}

async function exportAllCanvases() {
    try {
        // Save current canvas first
        await saveCurrentCanvas();

        const allData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            canvases: state.canvases.map(c => ({ ...c })),
            data: {}
        };

        // Collect all canvas data
        for (const canvas of state.canvases) {
            const savedData = localStorage.getItem('knotpad-data-' + canvas.id);
            if (savedData) {
                allData.data[canvas.id] = JSON.parse(savedData);
            }
        }

        const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `knotpad-all-canvases-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('All canvases exported successfully');
    } catch (e) {
        console.error('Export failed:', e);
        showToast('Export failed', 'error');
    }
}

// ============ Auto Save ============

// Track if there are pending changes that need to be saved
let hasPendingChanges = false;

export function triggerAutoSave() {
    hasPendingChanges = true;
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    state.setAutoSaveTimer(setTimeout(() => {
        saveCurrentCanvas();
        hasPendingChanges = false;
    }, 1500));
}

// Synchronous save to localStorage only (for beforeunload)
function saveToLocalStorageSync() {
    if (!state.currentCanvasId) return;
    try {
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
                locked: i.locked,
                manuallyResized: i.manuallyResized,
                z: parseInt(i.el.style.zIndex)
            })),
            connections: state.connections.map(c => ({
                id: c.id,
                from: c.from.id,
                fh: c.fh,
                to: c.to.id,
                th: c.th,
                dir: c.dir
            })),
            view: { scale: state.scale, offsetX: state.offsetX, offsetY: state.offsetY },
            itemId: state.itemId,
            highestZ: state.highestZ
        };
        localStorage.setItem('knotpad-data-' + state.currentCanvasId, JSON.stringify(data));
    } catch (e) {
        console.error('Sync save failed:', e);
    }
}

// Save on page unload to prevent data loss
window.addEventListener('beforeunload', () => {
    if (hasPendingChanges && state.currentCanvasId) {
        saveToLocalStorageSync();
    }
});

// Also save on visibility change (when user switches tabs or minimizes)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasPendingChanges && state.currentCanvasId) {
        saveToLocalStorageSync();
        hasPendingChanges = false;
    }
});

// ============ Close Sidebar ============

export function closeSidebarIfUnpinned() {
    if (!state.sidebarPinned && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        state.setSidebarOpen(false);
    }
}

// ============ Sidebar Resize ============

const SIDEBAR_WIDTH_KEY = 'knotpad-sidebar-width';
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;

export function setupSidebarResize() {
    const resizeHandle = $('sidebarResizeHandle');
    if (!resizeHandle) return;

    // Load saved width
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
        document.documentElement.style.setProperty('--sidebar-width', savedWidth + 'px');
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', e => {
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 280;
        sidebar.classList.add('resizing');
        resizeHandle.classList.add('active');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        const delta = e.clientX - startX;
        let newWidth = startWidth + delta;
        newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth));
        document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        sidebar.classList.remove('resizing');
        resizeHandle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Save the width
        const currentWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 280;
        localStorage.setItem(SIDEBAR_WIDTH_KEY, currentWidth);
    });
}

// ============ File Handling ============

export async function handleFile(file, x, y) {
    const mediaId = 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
            let w = img.width, h = img.height;
            if (w > 400) { h = 400 / w * h; w = 400; }
            if (h > 300) { w = 300 / h * w; h = 300; }
            URL.revokeObjectURL(url);
            await saveMedia(mediaId, file);
            if (fsDirectoryHandle) {
                await saveMediaToFileSystem(mediaId, file);
            }
            state.blobURLCache.set(mediaId, URL.createObjectURL(file));
            createItem({ type: 'image', x, y, w, h, content: mediaId });
            eventBus.emit(Events.STATE_SAVE);
            triggerAutoSave();
        };
        img.src = url;
    } else if (file.type.startsWith('video/')) {
        await saveMedia(mediaId, file);
        if (fsDirectoryHandle) {
            await saveMediaToFileSystem(mediaId, file);
        }
        state.blobURLCache.set(mediaId, URL.createObjectURL(file));
        createItem({ type: 'video', x, y, w: 400, h: 225, content: mediaId });
        eventBus.emit(Events.STATE_SAVE);
        triggerAutoSave();
    }
}

// Re-export items functions needed by other modules
export { deleteSelectedItems, deselectAll, deleteItem } from './items.js';
