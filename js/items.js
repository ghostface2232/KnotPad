// KnotPad - Items Module (Create, Manage, Delete)

import { COLORS, COLOR_MAP, FONT_SIZES } from './constants.js';
import { $, esc, findFreePosition } from './utils.js';
import * as state from './state.js';
import { throttledMinimap, updateMinimap } from './viewport.js';
import { deleteMedia, deleteMediaFromFileSystem, fsDirectoryHandle } from './storage.js';

const canvas = $('canvas');

// External function references (set by other modules)
let updateAllConnectionsFn = () => {};
let updateConnectionFn = () => {};
let deleteConnectionFn = () => {};
let saveStateFn = () => {};
let triggerAutoSaveFn = () => {};
let showChildTypePickerFn = () => {};
let startConnectionFn = () => {};
let completeConnectionFn = () => {};
let showContextMenuFn = () => {};

export function setExternalFunctions({
    updateAllConnections,
    updateConnection,
    deleteConnection,
    saveState,
    triggerAutoSave,
    showChildTypePicker,
    startConnection,
    completeConnection,
    showContextMenu
}) {
    if (updateAllConnections) updateAllConnectionsFn = updateAllConnections;
    if (updateConnection) updateConnectionFn = updateConnection;
    if (deleteConnection) deleteConnectionFn = deleteConnection;
    if (saveState) saveStateFn = saveState;
    if (triggerAutoSave) triggerAutoSaveFn = triggerAutoSave;
    if (showChildTypePicker) showChildTypePickerFn = showChildTypePicker;
    if (startConnection) startConnectionFn = startConnection;
    if (completeConnection) completeConnectionFn = completeConnection;
    if (showContextMenu) showContextMenuFn = showContextMenu;
}

// Create an item on the canvas
export function createItem(cfg, loading = false) {
    const el = document.createElement('div');
    el.className = 'canvas-item' + (loading ? '' : ' new');
    el.style.cssText = `left:${cfg.x}px;top:${cfg.y}px;width:${cfg.w}px;height:${cfg.h}px;z-index:${state.incrementHighestZ()}`;

    let html = '';
    let mediaSrc = '';

    if ((cfg.type === 'image' || cfg.type === 'video') && cfg.content) {
        mediaSrc = cfg.content.startsWith('media_') ? (state.blobURLCache.get(cfg.content) || '') : cfg.content;
    }

    switch (cfg.type) {
        case 'image':
            html = `<img class="item-image" src="${mediaSrc}">`;
            break;
        case 'video':
            html = `<video class="item-video" src="${mediaSrc}" controls></video>`;
            break;
        case 'note':
            html = `<div class="item-note"><input class="note-title" placeholder="Title..." value="${esc(cfg.content.title)}"><textarea class="note-body" placeholder="Write something...">${esc(cfg.content.body)}</textarea></div>`;
            break;
        case 'memo':
            html = `<div class="item-memo"><textarea class="memo-body" placeholder="Quick memo...">${esc(cfg.content)}</textarea></div>`;
            break;
        case 'link':
            html = `<div class="item-link"><img class="link-favicon" src="https://www.google.com/s2/favicons?domain=${new URL(cfg.content.url).hostname}&sz=64"><div class="link-title">${esc(cfg.content.title)}</div><a class="link-url" href="${cfg.content.url}" target="_blank">${cfg.content.display}</a></div>`;
            break;
    }

    if (cfg.color) {
        el.style.setProperty('--tag-color', COLOR_MAP[cfg.color]);
        el.classList.add('has-color');
    }

    if (cfg.fontSize && (cfg.type === 'note' || cfg.type === 'memo')) {
        el.classList.add('font-size-' + cfg.fontSize);
    }

    const fontSizeBtn = (cfg.type === 'note' || cfg.type === 'memo')
        ? `<button class="font-size-btn" title="Font Size"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg></button>`
        : '';

    el.innerHTML = `<div class="color-dot"></div><div class="item-content">${html}</div><button class="delete-btn">×</button>${fontSizeBtn}<button class="color-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"/></svg></button><div class="color-picker"><div class="color-opt none" data-color="" title="None"></div>${COLORS.map(c => `<div class="color-opt" data-color="${c}" style="background:${COLOR_MAP[c]}" title="${c}"></div>`).join('')}</div><div class="resize-handle"></div><div class="connection-handle top" data-h="top"></div><div class="connection-handle bottom" data-h="bottom"></div><div class="connection-handle left" data-h="left"></div><div class="connection-handle right" data-h="right"></div><button class="add-child-btn top" data-d="top">+</button><button class="add-child-btn bottom" data-d="bottom">+</button><button class="add-child-btn left" data-d="left">+</button><button class="add-child-btn right" data-d="right">+</button>`;

    canvas.appendChild(el);

    const item = {
        id: cfg.id || `i${state.incrementItemId()}`,
        el,
        type: cfg.type,
        x: cfg.x,
        y: cfg.y,
        w: cfg.w,
        h: cfg.h,
        content: cfg.content,
        color: cfg.color || null,
        fontSize: cfg.fontSize || null,
        locked: cfg.locked || false
    };

    state.items.push(item);
    setupItemEvents(item);

    if (!loading) {
        throttledMinimap();
        if (state.activeFilter !== 'all' && item.color !== state.activeFilter) {
            item.el.classList.add('filtered-out');
        }
    }

    setTimeout(() => el.classList.remove('new'), 200);
    return item;
}

// Setup event handlers for an item
function setupItemEvents(item) {
    const el = item.el;

    el.addEventListener('mousedown', e => {
        const t = e.target;
        if (t.classList.contains('delete-btn') || t.classList.contains('resize-handle') ||
            t.classList.contains('connection-handle') || t.classList.contains('add-child-btn') ||
            t.classList.contains('color-btn') || t.classList.contains('font-size-btn') ||
            t.classList.contains('color-opt') || t.closest('.color-picker') ||
            t.tagName === 'VIDEO' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
            return;
        }
        if (item.locked) return;

        e.stopPropagation();
        if (!state.selectedItems.has(item) && !e.shiftKey) {
            selectItem(item, false);
        } else if (e.shiftKey) {
            if (state.selectedItems.has(item)) state.selectedItems.delete(item);
            else state.selectedItems.add(item);
            item.el.classList.toggle('selected');
        } else {
            selectItem(item, true);
        }

        el.style.zIndex = state.incrementHighestZ();
        const rect = el.getBoundingClientRect();
        item.ox = (e.clientX - rect.left) / state.scale;
        item.oy = (e.clientY - rect.top) / state.scale;
        state.setDraggedItem(item);
        state.selectedItems.forEach(i => i.el.classList.add('dragging'));
        canvas.classList.add('dragging-item');
    });

    el.querySelector('.resize-handle').addEventListener('mousedown', e => {
        if (item.locked) return;
        e.stopPropagation();
        state.setResizingItem(item);
    });

    el.querySelector('.delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (state.selectedItems.has(item)) deleteSelectedItems();
        else deleteItem(item);
    });

    const colorBtnEl = el.querySelector('.color-btn');
    const colorPicker = el.querySelector('.color-picker');

    colorBtnEl.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.color-picker.active').forEach(p => {
            if (p !== colorPicker) p.classList.remove('active');
        });
        colorPicker.classList.toggle('active');
        colorPicker.querySelectorAll('.color-opt').forEach(o =>
            o.classList.toggle('selected', o.dataset.color === (item.color || ''))
        );
    });

    colorPicker.querySelectorAll('.color-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            setItemColor(item, opt.dataset.color || null);
            colorPicker.classList.remove('active');
        });
    });

    const fontSizeBtn = el.querySelector('.font-size-btn');
    if (fontSizeBtn) {
        fontSizeBtn.addEventListener('click', e => {
            e.stopPropagation();
            setItemFontSize(item);
        });
    }

    el.querySelectorAll('.add-child-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            showChildTypePickerFn(item, btn.dataset.d, e);
        });
    });

    el.querySelectorAll('.connection-handle').forEach(h => {
        h.addEventListener('mousedown', e => {
            e.stopPropagation();
            if (state.connectSource) {
                completeConnectionFn(item, h.dataset.h);
            } else {
                startConnectionFn(item, h.dataset.h);
            }
        });
        h.addEventListener('mouseenter', () => {
            if (state.connectSource && state.connectSource !== item) {
                el.classList.add('connect-target');
            }
        });
        h.addEventListener('mouseleave', () => el.classList.remove('connect-target'));
    });

    el.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!state.selectedItems.has(item)) selectItem(item);
        showContextMenuFn(e.clientX, e.clientY, item);
    });

    if (item.type === 'note') {
        const ti = el.querySelector('.note-title');
        const tb = el.querySelector('.note-body');
        ti.addEventListener('input', () => {
            item.content.title = ti.value;
            autoResizeItem(item);
            triggerAutoSaveFn();
        });
        tb.addEventListener('input', () => {
            item.content.body = tb.value;
            autoResizeItem(item);
            triggerAutoSaveFn();
        });
    }

    if (item.type === 'memo') {
        const mb = el.querySelector('.memo-body');
        mb.addEventListener('input', () => {
            item.content = mb.value;
            autoResizeItem(item);
            triggerAutoSaveFn();
        });
    }
}

// Set item color
export function setItemColor(targetItem, color) {
    const targets = state.selectedItems.size > 0 ? state.selectedItems : new Set([targetItem]);
    targets.forEach(item => {
        item.color = color || null;
        if (color) {
            item.el.style.setProperty('--tag-color', COLOR_MAP[color]);
            item.el.classList.add('has-color');
        } else {
            item.el.style.setProperty('--tag-color', 'transparent');
            item.el.classList.remove('has-color');
        }
        item.el.querySelectorAll('.color-opt').forEach(o =>
            o.classList.toggle('selected', o.dataset.color === (color || ''))
        );
        if (state.activeFilter !== 'all') {
            item.el.classList.toggle('filtered-out', item.color !== state.activeFilter);
        }
        // Update connections from this node
        state.connections.filter(c => c.from === item).forEach(updateConnectionFn);
    });
    throttledMinimap();
    saveStateFn();
    triggerAutoSaveFn();
}

// Set item font size
export function setItemFontSize(item) {
    if (item.type !== 'note' && item.type !== 'memo') return;
    const currentIndex = FONT_SIZES.indexOf(item.fontSize);
    const nextIndex = (currentIndex + 1) % FONT_SIZES.length;
    const newSize = FONT_SIZES[nextIndex];

    FONT_SIZES.forEach(s => { if (s) item.el.classList.remove('font-size-' + s); });
    item.fontSize = newSize;
    if (newSize) {
        item.el.classList.add('font-size-' + newSize);
    }
    setTimeout(() => autoResizeItem(item), 10);
    saveStateFn();
    triggerAutoSaveFn();
}

// Auto-resize item based on content
export function autoResizeItem(item) {
    if (item.type !== 'note' && item.type !== 'memo') return;
    const textarea = item.el.querySelector('.note-body, .memo-body');
    if (!textarea) return;

    let fontMultiplier = 1;
    if (item.fontSize === 'medium') fontMultiplier = 1.1;
    else if (item.fontSize === 'large') fontMultiplier = 1.25;
    else if (item.fontSize === 'xlarge') fontMultiplier = 1.4;

    // Temporarily remove flex to measure true content height
    const origFlex = textarea.style.flex;
    const origH = textarea.style.height;
    textarea.style.flex = 'none';
    textarea.style.height = '0px';
    const scrollH = textarea.scrollHeight;
    textarea.style.height = origH;
    textarea.style.flex = origFlex;

    let extraH;
    if (item.type === 'note') {
        const baseTitleH = Math.round(24 * fontMultiplier);
        extraH = baseTitleH + 6 + 28 + 5;
    } else {
        extraH = 24 + 5;
    }

    const minH = Math.round((item.type === 'note' ? 100 : 80) * fontMultiplier);
    const maxH = Math.round(500 * fontMultiplier);
    const newH = Math.min(Math.max(scrollH + extraH, minH), maxH);

    if (Math.abs(newH - item.h) > 8) {
        item.h = newH;
        item.el.style.height = item.h + 'px';
        updateAllConnectionsFn();
        throttledMinimap();
    }
}

// Select an item
export function selectItem(item, accumulate = false) {
    if (!accumulate) deselectAll();
    state.selectedItems.add(item);
    item.el.classList.add('selected');
    window.selectedItem = item;
}

// Deselect all items
export function deselectAll() {
    state.selectedItems.forEach(i => i.el.classList.remove('selected'));
    state.selectedItems.clear();
    window.selectedItem = null;

    if (state.selectedConn) {
        state.selectedConn.el.classList.remove('selected');
        if (state.selectedConn.arrow) state.selectedConn.arrow.classList.remove('selected');
        state.setSelectedConn(null);
    }
    hideMenus();
    document.querySelectorAll('.color-picker.active').forEach(p => p.classList.remove('active'));
}

// Hide all menus
function hideMenus() {
    $('contextMenu').classList.remove('active');
    $('filterDropdown').classList.remove('active');
    $('colorDropdown').classList.remove('active');
    $('connDirectionPicker').classList.remove('active');
    $('childTypePicker').classList.remove('active');
    $('canvasIconPicker').classList.remove('active');
    $('newNodePicker').classList.remove('active');
    state.setNewNodePickerData(null);
}

export { hideMenus };

// Delete selected items
export function deleteSelectedItems() {
    if (!state.selectedItems.size) return;
    saveStateFn();
    state.selectedItems.forEach(item => deleteItem(item, false));
    state.selectedItems.clear();
    throttledMinimap();
    triggerAutoSaveFn();
}

// Delete a single item
export function deleteItem(item, update = true) {
    state.connections.filter(c => c.from === item || c.to === item).forEach(c => deleteConnectionFn(c, false));

    if ((item.type === 'image' || item.type === 'video') && item.content?.startsWith('media_')) {
        deleteMedia(item.content);
        if (fsDirectoryHandle) {
            deleteMediaFromFileSystem(item.content);
        }
        const url = state.blobURLCache.get(item.content);
        if (url) {
            URL.revokeObjectURL(url);
            state.blobURLCache.delete(item.content);
        }
    }

    const i = state.items.indexOf(item);
    if (i > -1) {
        state.items.splice(i, 1);
        item.el.remove();
    }

    if (update) {
        saveStateFn();
        throttledMinimap();
        triggerAutoSaveFn();
    }
}

// Duplicate an item
export function duplicateItem(item) {
    const pos = findFreePosition(item.x + 24, item.y + 24, state.items);
    createItem({
        type: item.type,
        x: pos.x,
        y: pos.y,
        w: item.w,
        h: item.h,
        content: JSON.parse(JSON.stringify(item.content)),
        color: item.color,
        fontSize: item.fontSize
    });
    saveStateFn();
    triggerAutoSaveFn();
}

// Add note
export function addNote(title = '', body = '', x, y, color = null) {
    const pos = findFreePosition(x, y, state.items);
    // Apply default font size setting
    const fontSize = state.defaultFontSize !== 'small' ? state.defaultFontSize : null;
    const item = createItem({
        type: 'note',
        x: pos.x,
        y: pos.y,
        w: 220,
        h: 140,
        content: { title, body },
        color,
        fontSize
    });
    triggerAutoSaveFn();
    return item;
}

// Add memo
export function addMemo(text = '', x, y, color = null) {
    const pos = findFreePosition(x, y, state.items);
    // Apply default font size setting
    const fontSize = state.defaultFontSize !== 'small' ? state.defaultFontSize : null;
    const item = createItem({
        type: 'memo',
        x: pos.x,
        y: pos.y,
        w: 180,
        h: 100,
        content: text,
        color,
        fontSize
    });
    triggerAutoSaveFn();
    return item;
}

// Add link
export function addLink(url, title, x, y) {
    const domain = new URL(url).hostname;
    const item = createItem({
        type: 'link',
        x,
        y,
        w: 260,
        h: 100,
        content: {
            url,
            title: title || domain,
            display: url.replace(/^https?:\/\//, '').replace(/\/$/, '')
        }
    });
    triggerAutoSaveFn();
    return item;
}

// Set filter
export function setFilter(color) {
    state.setActiveFilter(color);
    $('filterDropdown').querySelectorAll('.filter-opt').forEach(o =>
        o.classList.toggle('selected', o.dataset.color === color)
    );
    $('filterBtn').classList.toggle('filter-active', color !== 'all');
    state.items.forEach(item =>
        item.el.classList.toggle('filtered-out', color !== 'all' && item.color !== color)
    );
    throttledMinimap();
}
