// KnotPad - UI Module (Toolbar, Menus, Modals, Minimap, Search, Canvas Management)

import { CANVASES_KEY, CANVAS_GROUPS_KEY, THEME_KEY, CANVAS_ICONS, COLOR_MAP, MAX_HISTORY } from './constants.js';
import { $, esc, generateId, showToast } from './utils.js';
import * as state from './state.js';
import { updateTransform, throttledMinimap, panToItem, setMinimapUpdateFn } from './viewport.js';
import { createItem, addMemo, addLink, setFilter, deleteSelectedItems, duplicateItem, deselectAll, hideMenus } from './items.js';
import { addConnection, updateConnectionArrow, updateAllConnections } from './connections.js';
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

// DOM Elements
const sidebar = $('sidebar');
const canvasList = $('canvasList');
const canvasIconPicker = $('canvasIconPicker');
const canvasGroupPicker = $('canvasGroupPicker');
const searchBar = $('searchBar');
const searchInput = $('searchInput');
const minimapContent = $('minimapContent');
const linkModal = $('linkModal');
const settingsModal = $('settingsModal');
const contextMenu = $('contextMenu');
const canvasContextMenu = $('canvasContextMenu');
const fileInput = $('fileInput');

// External function references
let saveStateFn = () => {};
let triggerAutoSaveFn = () => {};
let addChildNodeFn = () => {};

export function setExternalFunctions({ saveState, triggerAutoSave, addChildNode }) {
    if (saveState) saveStateFn = saveState;
    if (triggerAutoSave) triggerAutoSaveFn = triggerAutoSave;
    if (addChildNode) addChildNodeFn = addChildNode;
}

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
    const stateString = JSON.stringify(stateData);

    // Prevent duplicate states - don't save if identical to last state
    if (state.undoStack.length > 0 && state.undoStack[state.undoStack.length - 1] === stateString) {
        return;
    }

    state.pushUndo(stateString);
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
    restoreState(JSON.parse(state.undoStack[state.undoStack.length - 1]));
    updateUndoRedoButtons();
    triggerAutoSaveFn();
}

export function redo() {
    if (!state.redoStack.length) return;
    const stateData = state.popRedo();
    state.pushUndo(stateData);
    restoreState(JSON.parse(stateData));
    updateUndoRedoButtons();
    triggerAutoSaveFn();
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
        if (!state.canvases.length) {
            state.setCanvases([{ id: generateId(), name: 'Untitled', createdAt: Date.now(), itemCount: 0 }]);
        }
        saveCanvasesList();
        loadCanvasGroups();
        const lastId = localStorage.getItem('knotpad-active-canvas');
        const target = state.canvases.find(c => c.id === lastId) || state.canvases[0];
        if (target) await switchCanvas(target.id);
        renderCanvasList();
    } catch (e) {
        console.error(e);
    }
}

export function loadCanvasGroups() {
    try {
        state.setCanvasGroups(JSON.parse(localStorage.getItem(CANVAS_GROUPS_KEY) || '[]'));
    } catch (e) {
        console.error(e);
        state.setCanvasGroups([]);
    }
}

export function saveCanvasesList() {
    localStorage.setItem(CANVASES_KEY, JSON.stringify(state.canvases));
    if (fsDirectoryHandle) {
        saveCanvasesListToFileSystem();
    }
}

export function saveCanvasGroups() {
    localStorage.setItem(CANVAS_GROUPS_KEY, JSON.stringify(state.canvasGroups));
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

        // Load media
        const mediaItems = data.items.filter(d => (d.type === 'image' || d.type === 'video') && d.content?.startsWith('media_'));
        for (const d of mediaItems) {
            if (!state.blobURLCache.has(d.content)) {
                let blob = null;
                if (fsDirectoryHandle) {
                    blob = await loadMediaFromFileSystem(d.content);
                }
                if (!blob) {
                    blob = await loadMedia(d.content);
                }
                if (blob) state.blobURLCache.set(d.content, URL.createObjectURL(blob));
            }
        }

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
        state.setUndoStack([JSON.stringify({ items: data.items, connections: data.connections.map(c => ({ ...c })) })]);
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
        state.setUndoStack([JSON.stringify({ items: [], connections: [] })]);
    }
    updateUndoRedoButtons();
    setFilter('all');
    updateMinimap();
    renderCanvasList();
    updateTopbarCanvasName();
}

export async function createNewCanvas() {
    const nc = { id: generateId(), name: 'Untitled', createdAt: Date.now(), itemCount: 0 };
    state.canvases.unshift(nc);
    saveCanvasesList();
    await switchCanvas(nc.id);
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

        // Remove from all groups
        state.canvasGroups.forEach(g => {
            const gIdx = g.canvasIds.indexOf(id);
            if (gIdx > -1) g.canvasIds.splice(gIdx, 1);
        });

        localStorage.removeItem('knotpad-data-' + id);
        if (fsDirectoryHandle) {
            await deleteCanvasFromFileSystem(id);
        }
        saveCanvasesList();
        saveCanvasGroups();
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

// ============ Canvas Group Management ============

export function createNewGroup(name = 'New Group') {
    const newGroup = {
        id: generateId(),
        name: name,
        canvasIds: [],
        collapsed: false,
        createdAt: Date.now()
    };
    state.canvasGroups.push(newGroup);
    saveCanvasGroups();
    renderCanvasList();
    return newGroup;
}

function toggleGroup(groupId) {
    const group = state.canvasGroups.find(g => g.id === groupId);
    if (group) {
        group.collapsed = !group.collapsed;
        saveCanvasGroups();
        renderCanvasList();
    }
}

function startGroupRename(groupEl, groupId) {
    const nameEl = groupEl.querySelector('.canvas-group-name');
    const group = state.canvasGroups.find(g => g.id === groupId);
    const oldName = group?.name || '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'canvas-group-name-input';
    input.value = oldName;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
        if (group) {
            group.name = input.value.trim() || 'Unnamed Group';
            saveCanvasGroups();
            renderCanvasList();
        }
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = oldName; input.blur(); }
    });
}

function deleteGroup(groupId) {
    if (!confirm('Delete this group? Canvases will not be deleted.')) return;

    const idx = state.canvasGroups.findIndex(g => g.id === groupId);
    if (idx > -1) {
        state.canvasGroups.splice(idx, 1);
        saveCanvasGroups();
        renderCanvasList();
        showToast('Group deleted');
    }
}

export function addCanvasToGroup(canvasId, groupId) {
    // Remove from all groups first
    state.canvasGroups.forEach(g => {
        const idx = g.canvasIds.indexOf(canvasId);
        if (idx > -1) g.canvasIds.splice(idx, 1);
    });

    // Add to new group
    const group = state.canvasGroups.find(g => g.id === groupId);
    if (group && !group.canvasIds.includes(canvasId)) {
        group.canvasIds.push(canvasId);
        saveCanvasGroups();
        renderCanvasList();
    }
}

export function removeCanvasFromGroup(canvasId) {
    state.canvasGroups.forEach(g => {
        const idx = g.canvasIds.indexOf(canvasId);
        if (idx > -1) g.canvasIds.splice(idx, 1);
    });
    saveCanvasGroups();
    renderCanvasList();
}

function updateTopbarCanvasName() {
    const c = state.canvases.find(x => x.id === state.currentCanvasId);
    $('topbarCanvasName').textContent = c?.name || 'Untitled';
}

function getCanvasIconHTML(c) {
    const colorClass = c.color ? `canvas-color-${c.color}` : '';
    const iconContent = c.icon && CANVAS_ICONS[c.icon]
        ? CANVAS_ICONS[c.icon]
        : `<span class="icon-letter">${esc((c.name || 'U').charAt(0).toUpperCase())}</span>`;

    if (c.color) {
        return `<div class="canvas-icon-wrapper ${colorClass}">${iconContent}</div>`;
    }
    return iconContent;
}

export function renderCanvasList() {
    // Get all canvas IDs that are in groups
    const groupedCanvasIds = new Set();
    state.canvasGroups.forEach(g => g.canvasIds.forEach(id => groupedCanvasIds.add(id)));

    // Ungrouped canvases
    const ungroupedCanvases = state.canvases.filter(c => !groupedCanvasIds.has(c.id));

    let html = '';

    // Render ungrouped canvases first
    ungroupedCanvases.forEach(c => {
        html += renderCanvasEntry(c);
    });

    // Render groups
    state.canvasGroups.forEach(group => {
        const groupCanvases = state.canvases.filter(c => group.canvasIds.includes(c.id));
        const isCollapsed = group.collapsed || false;
        html += `
            <div class="canvas-group" data-group-id="${group.id}">
                <div class="canvas-group-header">
                    <button class="canvas-group-toggle">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform: rotate(${isCollapsed ? 0 : 90}deg)">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </button>
                    <div class="canvas-group-name">${esc(group.name)}</div>
                    <div class="canvas-group-count">${groupCanvases.length}</div>
                    <div class="canvas-group-actions">
                        <button class="canvas-group-action-btn rename-group" title="Rename Group">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="canvas-group-action-btn delete-group" title="Delete Group">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="canvas-group-items" style="display: ${isCollapsed ? 'none' : 'block'}">
                    ${groupCanvases.map(c => renderCanvasEntry(c)).join('')}
                </div>
            </div>
        `;
    });

    canvasList.innerHTML = html;

    // Attach event listeners to canvas entries
    canvasList.querySelectorAll('.canvas-item-entry').forEach(entry => {
        const id = entry.dataset.id;
        entry.addEventListener('click', async e => {
            if (!e.target.closest('.canvas-action-btn') && !e.target.closest('.canvas-icon') && id !== state.currentCanvasId) {
                saveCurrentCanvas();
                await switchCanvas(id);
            }
        });
        const moveBtn = entry.querySelector('.move-to-group');
        const renameBtn = entry.querySelector('.rename');
        const deleteBtn = entry.querySelector('.delete');
        const iconBtn = entry.querySelector('.canvas-icon');

        if (moveBtn) moveBtn.addEventListener('click', e => { e.stopPropagation(); showGroupPicker(id, entry); });
        if (renameBtn) renameBtn.addEventListener('click', e => { e.stopPropagation(); startRename(entry, id); });
        if (deleteBtn) deleteBtn.addEventListener('click', e => { e.stopPropagation(); deleteCanvas(id); });
        if (iconBtn) iconBtn.addEventListener('click', e => { e.stopPropagation(); openIconPicker(id, entry); });
    });

    // Attach event listeners to group headers
    canvasList.querySelectorAll('.canvas-group').forEach(groupEl => {
        const groupId = groupEl.dataset.groupId;
        const toggle = groupEl.querySelector('.canvas-group-toggle');
        const header = groupEl.querySelector('.canvas-group-header');

        toggle.addEventListener('click', e => {
            e.stopPropagation();
            toggleGroup(groupId);
        });

        const renameBtn = groupEl.querySelector('.rename-group');
        const deleteBtn = groupEl.querySelector('.delete-group');

        if (renameBtn) renameBtn.addEventListener('click', e => {
            e.stopPropagation();
            startGroupRename(groupEl, groupId);
        });

        if (deleteBtn) deleteBtn.addEventListener('click', e => {
            e.stopPropagation();
            deleteGroup(groupId);
        });
    });
}

function renderCanvasEntry(c) {
    // Check if canvas is in a group
    const inGroup = state.canvasGroups.some(g => g.canvasIds.includes(c.id));

    return `
        <div class="canvas-item-entry ${c.id === state.currentCanvasId ? 'active' : ''}" data-id="${c.id}">
            <div class="canvas-icon" data-canvas-id="${c.id}">${getCanvasIconHTML(c)}</div>
            <div class="canvas-info">
                <div class="canvas-name">${esc(c.name)}</div>
                <div class="canvas-meta">${c.itemCount || 0} items</div>
            </div>
            <div class="canvas-actions">
                <button class="canvas-action-btn move-to-group" title="${inGroup ? 'Remove from group' : 'Add to group'}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                </button>
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

    const finish = () => renameCanvas(id, input.value.trim() || 'Untitled');
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
    canvasIconPicker.style.top = (rect.top - sidebarRect.top) + 'px';
    canvasIconPicker.querySelectorAll('.icon-opt').forEach(opt =>
        opt.classList.toggle('selected', opt.dataset.icon === (canvas?.icon || ''))
    );
    canvasIconPicker.querySelectorAll('.color-opt').forEach(opt =>
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
    }
}

function setCanvasColor(canvasId, color) {
    const c = state.canvases.find(x => x.id === canvasId);
    if (c) {
        c.color = color || null;
        c.updatedAt = Date.now();
        saveCanvasesList();
        renderCanvasList();
    }
}

function showGroupPicker(canvasId, entry) {
    // Check if canvas is already in a group
    const currentGroup = state.canvasGroups.find(g => g.canvasIds.includes(canvasId));

    const rect = entry.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();

    let html = '';

    // Option to remove from group
    if (currentGroup) {
        html += `<div class="group-picker-opt" data-action="remove" title="Remove from group">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            <span>Remove from group</span>
        </div>`;
    }

    // List all groups
    if (state.canvasGroups.length > 0) {
        state.canvasGroups.forEach(group => {
            const isInThisGroup = group.id === currentGroup?.id;
            html += `<div class="group-picker-opt ${isInThisGroup ? 'selected' : ''}" data-group-id="${group.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                </svg>
                <span>${esc(group.name)}</span>
            </div>`;
        });
    } else {
        html += `<div class="group-picker-opt disabled">No groups available</div>`;
    }

    canvasGroupPicker.innerHTML = html;
    canvasGroupPicker.style.top = (rect.top - sidebarRect.top) + 'px';
    canvasGroupPicker.classList.add('active');
    canvasGroupPicker.dataset.canvasId = canvasId;

    // Add event listeners
    canvasGroupPicker.querySelectorAll('.group-picker-opt').forEach(opt => {
        if (!opt.classList.contains('disabled')) {
            opt.addEventListener('click', e => {
                e.stopPropagation();
                if (opt.dataset.action === 'remove') {
                    removeCanvasFromGroup(canvasId);
                } else if (opt.dataset.groupId) {
                    addCanvasToGroup(canvasId, opt.dataset.groupId);
                }
                canvasGroupPicker.classList.remove('active');
            });
        }
    });
}

export function setupCanvasIconPicker() {
    canvasIconPicker.querySelectorAll('.icon-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            if (state.iconPickerTarget) setCanvasIcon(state.iconPickerTarget, opt.dataset.icon);
            canvasIconPicker.classList.remove('active');
            state.setIconPickerTarget(null);
        });
    });
    canvasIconPicker.querySelectorAll('.color-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            if (state.iconPickerTarget) setCanvasColor(state.iconPickerTarget, opt.dataset.color);
            canvasIconPicker.classList.remove('active');
            state.setIconPickerTarget(null);
        });
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
                        saveStateFn();
                        triggerAutoSaveFn();
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
                    saveStateFn();
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
    addChildNodeFn(parentItem, direction, 'memo');
}

export function setupChildTypePicker() {
    // No longer needed - memo is created directly
}

// ============ New Node Picker (Direct Memo Creation) ============

export function showNewNodePicker(clientX, clientY, canvasX, canvasY) {
    // Create memo directly without popup
    addMemo('', canvasX, canvasY);
    saveStateFn();
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
            saveStateFn();
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
    }
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
            saveStateFn();
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
        saveStateFn();
        triggerAutoSave();
    }
}

// Re-export items functions needed by other modules
export { deleteSelectedItems, deselectAll, deleteItem } from './items.js';
