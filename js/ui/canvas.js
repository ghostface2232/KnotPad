// KnotPad - Canvas Management Module
// Canvas CRUD, Groups, Rendering, Minimap, State Restoration
// Dependency direction: core.js, external modules

import { CANVASES_KEY, CANVAS_GROUPS_KEY, CANVAS_ICONS, COLOR_MAP } from '../constants.js';
import { $, esc, generateId, showToast } from '../utils.js';
import * as state from '../state.js';
import { updateTransform, setMinimapUpdateFn } from '../viewport.js';
import { createItem, setFilter } from '../items.js';
import { addConnection, updateConnectionArrow, updateConnectionLabel } from '../connections.js';
import {
    fsDirectoryHandle,
    saveCanvasesListToFileSystem,
    saveCanvasToFileSystem,
    loadCanvasFromFileSystem,
    deleteCanvasFromFileSystem,
    loadMedia,
    loadMediaFromFileSystem
} from '../storage.js';
import eventBus, { Events } from '../events-bus.js';
import { updateUndoRedoButtons, normalizeZIndices, setSaveCurrentCanvasFn } from './core.js';

// DOM Elements
const sidebar = $('sidebar');
const canvasList = $('canvasList');
const canvasIconPicker = $('canvasIconPicker');
const minimapContent = $('minimapContent');

// ============ Undo/Redo with State Restoration ============

export function undo() {
    if (state.undoStack.length < 2) return;
    state.pushRedo(state.popUndo());
    restoreState(state.undoStack[state.undoStack.length - 1]);
    updateUndoRedoButtons();
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

export function redo() {
    if (!state.redoStack.length) return;
    const stateData = state.popRedo();
    state.pushUndo(stateData);
    restoreState(stateData);
    updateUndoRedoButtons();
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

function restoreState(stateData) {
    // Clear existing items and connections
    state.connections.forEach(c => {
        c.el.remove();
        if (c.hitArea) c.hitArea.remove();
        if (c.arrow) c.arrow.remove();
    });
    state.connections.length = 0;
    state.items.forEach(i => i.el.remove());
    state.items.length = 0;
    state.selectedItems.clear();
    state.setSelectedConn(null);

    // Calculate maximum item ID to prevent collisions
    let maxItemId = 0;
    stateData.items.forEach(d => {
        if (d.id) {
            const match = d.id.match(/^i(\d+)$/);
            if (match) {
                const idNum = parseInt(match[1], 10);
                if (idNum > maxItemId) maxItemId = idNum;
            }
        }
    });
    if (maxItemId > state.itemId) state.setItemId(maxItemId);

    // Restore items
    const map = {};
    stateData.items.forEach(d => {
        const i = createItem(d, true);
        i.el.style.zIndex = d.z || 1;
        i.locked = d.locked;
        i.manuallyResized = d.manuallyResized || false;
        if (i.locked) i.el.classList.add('locked');
        map[d.id] = i;
    });

    // Restore connections
    stateData.connections.forEach(d => {
        const fromItem = map[d.from];
        const toItem = map[d.to];
        if (fromItem && toItem && fromItem !== toItem) {
            const c = addConnection(fromItem, d.fh, toItem, d.th, true);
            c.dir = d.dir || 'none';
            c.label = d.label || '';
            updateConnectionArrow(c);
            updateConnectionLabel(c);
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
        console.error('Load canvases error:', e);
    }
}

export function saveCanvasesList() {
    localStorage.setItem(CANVASES_KEY, JSON.stringify(state.canvases));
    localStorage.setItem(CANVAS_GROUPS_KEY, JSON.stringify(state.canvasGroups));
    if (fsDirectoryHandle) saveCanvasesListToFileSystem();
}

export async function saveCurrentCanvas() {
    if (!state.currentCanvasId) return;

    // Normalize z-indices if needed
    normalizeZIndices();

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
            dir: c.dir,
            label: c.label || ''
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

// Register save function with core module
setSaveCurrentCanvasFn(saveCurrentCanvas);

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

        // Calculate max item ID
        let maxLoadedItemId = 0;
        if (data.items?.length > 0) {
            data.items.forEach(d => {
                if (d.id) {
                    const match = d.id.match(/^i(\d+)$/);
                    if (match) {
                        const idNum = parseInt(match[1], 10);
                        if (idNum > maxLoadedItemId) maxLoadedItemId = idNum;
                    }
                }
            });
        }

        const savedItemId = data.itemId || 0;
        state.setItemId(Math.max(savedItemId, maxLoadedItemId));
        state.setHighestZ(data.highestZ || 1);

        if (data.view) {
            state.setScale(data.view.scale);
            state.setOffsetX(data.view.offsetX);
            state.setOffsetY(data.view.offsetY);
            updateTransform();
        }

        // Load media with retry
        const mediaItems = data.items.filter(d =>
            (d.type === 'image' || d.type === 'video') && d.content?.startsWith('media_')
        );

        const loadMediaWithRetry = async (mediaId, retries = 2) => {
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    let blob = fsDirectoryHandle ? await loadMediaFromFileSystem(mediaId) : null;
                    if (!blob) blob = await loadMedia(mediaId);
                    if (blob) {
                        state.blobURLCache.set(mediaId, URL.createObjectURL(blob));
                        return true;
                    }
                } catch (e) {
                    console.warn(`Media load attempt ${attempt + 1} failed for ${mediaId}`);
                }
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                }
            }
            return false;
        };

        await Promise.all(mediaItems.map(d =>
            !state.blobURLCache.has(d.content) ? loadMediaWithRetry(d.content) : Promise.resolve(true)
        ));

        // Create items and connections
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
            const fromItem = map[d.from];
            const toItem = map[d.to];
            if (fromItem && toItem && fromItem !== toItem) {
                const c = addConnection(fromItem, d.fh, toItem, d.th, true);
                c.dir = d.dir || 'none';
                c.label = d.label || '';
                updateConnectionArrow(c);
                updateConnectionLabel(c);
            }
        });

        updateMinimap();
        state.setUndoStack([{ items: data.items, connections: data.connections.map(c => ({ ...c })) }]);
        state.setRedoStack([]);
        updateUndoRedoButtons();
    } catch (e) {
        console.error('Load canvas data error:', e);
    }
}

export async function switchCanvas(id) {
    // Cleanup current canvas
    state.blobURLCache.forEach(url => URL.revokeObjectURL(url));
    state.blobURLCache.clear();
    state.connections.forEach(c => {
        c.el.remove();
        if (c.hitArea) c.hitArea.remove();
        if (c.arrow) c.arrow.remove();
    });
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
        state.setUndoStack([{ items: [], connections: [] }]);
    }
    updateUndoRedoButtons();
    setFilter('all');
    updateMinimap();
    renderCanvasList();
    updateTopbarCanvasName();
}

export async function createNewCanvas(groupId = null) {
    const nc = { id: generateId(), name: 'Untitled', createdAt: Date.now(), itemCount: 0, groupId };
    if (groupId) {
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
        if (fsDirectoryHandle) await deleteCanvasFromFileSystem(id);
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
    const el = $('topbarCanvasName');
    if (el) el.textContent = c?.name || 'Untitled';
}

// ============ Canvas Groups ============

export function createNewGroup() {
    const ng = { id: generateId(), name: 'New Group', createdAt: Date.now() };
    state.canvasGroups.push(ng);
    saveCanvasesList();
    renderCanvasList();
    setTimeout(() => {
        const header = canvasList?.querySelector(`.canvas-group[data-group-id="${ng.id}"] .canvas-group-header`);
        if (header) startGroupRename(header, ng.id);
    }, 50);
}

export function deleteGroup(groupId) {
    if (!confirm('Delete this group? Canvases inside will be moved out.')) return;
    state.canvases.forEach(c => { if (c.groupId === groupId) c.groupId = null; });
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

export function moveCanvasToGroup(canvasId, groupId) {
    const canvas = state.canvases.find(c => c.id === canvasId);
    if (canvas) {
        canvas.groupId = groupId || null;
        saveCanvasesList();
        renderCanvasList();
    }
}

// ============ Canvas List Rendering with Event Delegation ============

function getCanvasIconHTML(c) {
    if (c.icon && CANVAS_ICONS[c.icon]) return CANVAS_ICONS[c.icon];
    return `<span class="icon-letter">${esc((c.name || 'U').charAt(0).toUpperCase())}</span>`;
}

function getCanvasIconStyle(c, isActive) {
    if (c.color && COLOR_MAP[c.color]) {
        return `background: ${COLOR_MAP[c.color]}${isActive ? '' : '33'}; ${isActive ? 'color: white;' : `color: ${COLOR_MAP[c.color]};`}`;
    }
    return '';
}

function formatRelativeDate(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
                <button class="canvas-action-btn rename" data-action="rename" title="Rename">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="canvas-action-btn delete" data-action="delete" title="Delete">
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
                        <button class="group-action-btn add" data-action="add" title="Add Canvas">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>
                        </button>
                        <button class="group-action-btn rename" data-action="rename" title="Rename">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="group-action-btn delete" data-action="delete" title="Delete Group">
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
    if (!canvasList) return;

    const ungroupedCanvases = state.canvases.filter(c => !c.groupId);
    const groupedCanvasMap = new Map();
    state.canvasGroups.forEach(g => {
        groupedCanvasMap.set(g.id, state.canvases.filter(c => c.groupId === g.id));
    });

    let html = '';
    ungroupedCanvases.forEach(c => { html += renderCanvasEntry(c); });
    state.canvasGroups.forEach(group => {
        html += renderGroupHTML(group, groupedCanvasMap.get(group.id) || []);
    });

    canvasList.innerHTML = html;

    // Event delegation is set up once in setupCanvasListEvents
}

// Event delegation for canvas list - called once at init
export function setupCanvasListEvents() {
    if (!canvasList) return;

    // Single click handler for all canvas list interactions
    canvasList.addEventListener('click', async (e) => {
        const target = e.target;
        const entry = target.closest('.canvas-item-entry');
        const groupHeader = target.closest('.canvas-group-header');
        const actionBtn = target.closest('[data-action]');

        if (actionBtn) {
            e.stopPropagation();
            const action = actionBtn.dataset.action;

            if (entry) {
                const id = entry.dataset.id;
                if (action === 'rename') startRename(entry, id);
                else if (action === 'delete') deleteCanvas(id);
            } else if (groupHeader) {
                const groupId = groupHeader.dataset.groupId;
                if (action === 'add') {
                    await saveCurrentCanvas();
                    await createNewCanvas(groupId);
                }
                else if (action === 'rename') startGroupRename(groupHeader, groupId);
                else if (action === 'delete') deleteGroup(groupId);
            }
            return;
        }

        // Canvas icon click
        const canvasIcon = target.closest('.canvas-icon');
        if (canvasIcon && entry) {
            e.stopPropagation();
            openIconPicker(entry.dataset.id, entry);
            return;
        }

        // Group header collapse toggle
        if (groupHeader && !target.closest('.group-action-btn')) {
            const groupId = groupHeader.dataset.groupId;
            state.toggleGroupCollapsed(groupId);
            groupHeader.closest('.canvas-group')?.classList.toggle('collapsed');
            return;
        }

        // Canvas entry click (switch canvas)
        if (entry && !target.closest('.canvas-action-btn') && !target.closest('.canvas-icon')) {
            const id = entry.dataset.id;
            if (id !== state.currentCanvasId) {
                await saveCurrentCanvas();
                await switchCanvas(id);
            }
        }
    });

    // Double-click for rename
    canvasList.addEventListener('dblclick', (e) => {
        const canvasName = e.target.closest('.canvas-name');
        const groupName = e.target.closest('.group-name');

        if (canvasName) {
            const entry = canvasName.closest('.canvas-item-entry');
            if (entry) startRename(entry, entry.dataset.id);
        } else if (groupName) {
            const header = groupName.closest('.canvas-group-header');
            if (header) startGroupRename(header, header.dataset.groupId);
        }
    });

    // Drag and drop event delegation
    setupDragDropDelegation();

    // Drop zone for removing from groups
    setupCanvasListDropZone();
}

function setupDragDropDelegation() {
    if (!canvasList) return;

    canvasList.addEventListener('dragstart', (e) => {
        const entry = e.target.closest('.canvas-item-entry');
        if (!entry) return;
        e.dataTransfer.setData('text/plain', entry.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        entry.classList.add('dragging');
        canvasList.classList.add('drag-active');
        setTimeout(() => { entry.style.opacity = '0.4'; }, 0);
    });

    canvasList.addEventListener('dragend', (e) => {
        const entry = e.target.closest('.canvas-item-entry');
        if (!entry) return;
        entry.classList.remove('dragging');
        entry.style.opacity = '';
        canvasList.classList.remove('drag-active');
        canvasList.querySelectorAll('.drag-over, .drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });
    });

    canvasList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const entry = e.target.closest('.canvas-item-entry');
        const header = e.target.closest('.canvas-group-header');

        if (entry && !entry.classList.contains('dragging')) {
            e.dataTransfer.dropEffect = 'move';
            const rect = entry.getBoundingClientRect();
            const isAbove = e.clientY < rect.top + rect.height / 2;
            entry.classList.remove('drag-over-top', 'drag-over-bottom');
            entry.classList.add(isAbove ? 'drag-over-top' : 'drag-over-bottom');
        } else if (header) {
            e.dataTransfer.dropEffect = 'move';
        }
    });

    canvasList.addEventListener('dragleave', (e) => {
        const entry = e.target.closest('.canvas-item-entry');
        const header = e.target.closest('.canvas-group-header');
        if (entry && !entry.contains(e.relatedTarget)) {
            entry.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        }
        if (header) header.classList.remove('drag-over');
    });

    canvasList.addEventListener('dragenter', (e) => {
        const header = e.target.closest('.canvas-group-header');
        if (header) header.classList.add('drag-over');
    });

    canvasList.addEventListener('drop', (e) => {
        e.preventDefault();
        const entry = e.target.closest('.canvas-item-entry');
        const header = e.target.closest('.canvas-group-header');
        const draggedId = e.dataTransfer.getData('text/plain');

        if (entry) {
            const isAbove = entry.classList.contains('drag-over-top');
            entry.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
            if (draggedId && draggedId !== entry.dataset.id) {
                reorderCanvas(draggedId, entry.dataset.id, isAbove);
            }
        } else if (header) {
            header.classList.remove('drag-over');
            if (draggedId) moveCanvasToGroup(draggedId, header.dataset.groupId);
        }
    });
}

export function setupCanvasListDropZone() {
    if (!canvasList) return;

    canvasList.addEventListener('dragover', (e) => {
        if (e.target === canvasList) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });

    canvasList.addEventListener('drop', (e) => {
        if (e.target === canvasList) {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId) moveCanvasToGroup(draggedId, null);
        }
    });
}

function reorderCanvas(draggedId, targetId, insertBefore = false) {
    const draggedIdx = state.canvases.findIndex(c => c.id === draggedId);
    const targetIdx = state.canvases.findIndex(c => c.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1 || draggedIdx === targetIdx) return;

    const targetCanvas = state.canvases[targetIdx];
    const [draggedCanvas] = state.canvases.splice(draggedIdx, 1);
    draggedCanvas.groupId = targetCanvas.groupId || null;

    const newTargetIdx = state.canvases.findIndex(c => c.id === targetId);
    const insertIdx = insertBefore ? newTargetIdx : newTargetIdx + 1;
    state.canvases.splice(insertIdx, 0, draggedCanvas);

    saveCanvasesList();
    renderCanvasList();
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
    entry.draggable = false;

    const finish = () => {
        entry.draggable = true;
        renameCanvas(id, input.value.trim() || 'Untitled');
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = oldName; input.blur(); }
    });
}

// ============ Icon Picker ============

function openIconPicker(canvasId, entry) {
    if (!canvasIconPicker) return;

    state.setIconPickerTarget(canvasId);
    const canvas = state.canvases.find(c => c.id === canvasId);
    const rect = entry.getBoundingClientRect();
    const sidebarRect = sidebar?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };

    const pickerHeight = 180;
    const spaceBelow = sidebarRect.bottom - rect.bottom;
    const spaceAbove = rect.top - sidebarRect.top;

    if (spaceBelow >= pickerHeight || spaceBelow >= spaceAbove) {
        canvasIconPicker.style.top = (rect.bottom - sidebarRect.top + 4) + 'px';
        canvasIconPicker.style.bottom = '';
    } else {
        canvasIconPicker.style.top = '';
        canvasIconPicker.style.bottom = (sidebarRect.bottom - rect.top + 4) + 'px';
    }

    canvasIconPicker.querySelectorAll('.icon-opt').forEach(opt =>
        opt.classList.toggle('selected', opt.dataset.icon === (canvas?.icon || ''))
    );
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
        canvasIconPicker?.querySelectorAll('.icon-opt').forEach(opt =>
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
        canvasIconPicker?.querySelectorAll('.canvas-color-opt').forEach(opt =>
            opt.classList.toggle('selected', opt.dataset.color === (color || ''))
        );
    }
}

export function setupCanvasIconPicker() {
    if (!canvasIconPicker) return;

    canvasIconPicker.querySelectorAll('.icon-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            if (state.iconPickerTarget) setCanvasIcon(state.iconPickerTarget, opt.dataset.icon);
        });
    });

    canvasIconPicker.querySelectorAll('.canvas-color-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            if (state.iconPickerTarget) setCanvasColor(state.iconPickerTarget, opt.dataset.color);
        });
    });

    document.addEventListener('click', e => {
        if (canvasIconPicker.classList.contains('active') &&
            !canvasIconPicker.contains(e.target) &&
            !e.target.closest('.canvas-icon')) {
            canvasIconPicker.classList.remove('active');
            state.setIconPickerTarget(null);
        }
    });

    canvasIconPicker.addEventListener('click', e => e.stopPropagation());
}

// ============ Minimap ============

export function updateMinimap() {
    if (!minimapContent) return;

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

// Register minimap update function with viewport
setMinimapUpdateFn(updateMinimap);

export function setupMinimapClick() {
    const minimap = $('minimap');
    if (!minimap) return;

    minimap.addEventListener('click', e => {
        if (!state.items.length) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        state.items.forEach(i => {
            minX = Math.min(minX, i.x);
            minY = Math.min(minY, i.y);
            maxX = Math.max(maxX, i.x + i.w);
            maxY = Math.max(maxY, i.y + i.h);
        });

        minX -= 80; minY -= 80; maxX += 80; maxY += 80;
        const rect = minimap.getBoundingClientRect();
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

// ============ Canvas Duplication (for context menu) ============

export async function duplicateCanvas(canvasId) {
    const original = state.canvases.find(c => c.id === canvasId);
    if (!original) return;

    await saveCurrentCanvas();

    const newCanvas = {
        id: generateId(),
        name: original.name + ' (Copy)',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        itemCount: original.itemCount || 0,
        groupId: original.groupId || null,
        icon: original.icon || null,
        color: original.color || null
    };

    const originalData = localStorage.getItem('knotpad-data-' + canvasId);
    if (originalData) localStorage.setItem('knotpad-data-' + newCanvas.id, originalData);

    const originalIndex = state.canvases.findIndex(c => c.id === canvasId);
    state.canvases.splice(originalIndex + 1, 0, newCanvas);

    saveCanvasesList();
    renderCanvasList();
    showToast('Canvas duplicated');
}

export function collapseAllGroups() {
    state.canvasGroups.forEach(group => state.collapsedGroups.add(group.id));
    renderCanvasList();
}

export function expandAllGroups() {
    state.collapsedGroups.clear();
    renderCanvasList();
}
