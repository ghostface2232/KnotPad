(function() {
const $ = id => document.getElementById(id);
const canvas = $('canvas'), app = $('app'), dropZone = $('dropZone');
const contextMenu = $('contextMenu');
const connectionsSvg = $('connectionsSvg'), minimapContent = $('minimapContent');
const fileInput = $('fileInput'), toast = $('toast'), zoomDisplay = $('zoomDisplay');
const filterDropdown = $('filterDropdown'), filterBtn = $('filterBtn');
const colorDropdown = $('colorDropdown'), colorBtn = $('colorBtn');
const sidebar = $('sidebar'), sidebarToggle = $('sidebarToggle'), canvasList = $('canvasList');
const sidebarPinBtn = $('sidebarPinBtn'), canvasIconPicker = $('canvasIconPicker');
const selectionBox = $('selectionBox');
const linkModal = $('linkModal');
const searchBar = $('searchBar'), searchInput = $('searchInput');
const connDirectionPicker = $('connDirectionPicker');
const childTypePicker = $('childTypePicker');
const minimap = $('minimap');

const CANVASES_KEY = 'knotpad-canvases', THEME_KEY = 'knotpad-theme';
const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
const COLOR_MAP = { red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e', blue: '#3b82f6', purple: '#8b5cf6', pink: '#ec4899' };

const CANVAS_ICONS = {
    canvas: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6"/></svg>',
    music: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    image: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    document: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    chat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    chart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
    code: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>',
    bookmark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>',
    star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    heart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
    folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
};

// IndexedDB
let mediaDB = null;
const DB_NAME = 'knotpad-media', DB_VERSION = 1, MEDIA_STORE = 'media';
function initMediaDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { mediaDB = req.result; resolve(); };
        req.onupgradeneeded = e => { if (!e.target.result.objectStoreNames.contains(MEDIA_STORE)) e.target.result.createObjectStore(MEDIA_STORE, { keyPath: 'id' }); };
    });
}
function saveMedia(id, blob) { return new Promise((res, rej) => { if (!mediaDB) { rej(); return; } const tx = mediaDB.transaction(MEDIA_STORE, 'readwrite'); tx.objectStore(MEDIA_STORE).put({ id, blob }); tx.oncomplete = () => res(id); tx.onerror = () => rej(); }); }
function loadMedia(id) { return new Promise((res) => { if (!mediaDB) { res(null); return; } const tx = mediaDB.transaction(MEDIA_STORE, 'readonly'); const req = tx.objectStore(MEDIA_STORE).get(id); req.onsuccess = () => res(req.result?.blob || null); req.onerror = () => res(null); }); }
function deleteMedia(id) { if (!mediaDB) return; const tx = mediaDB.transaction(MEDIA_STORE, 'readwrite'); tx.objectStore(MEDIA_STORE).delete(id); }
const blobURLCache = new Map();

let scale = 1, offsetX = 0, offsetY = 0;
let isPanning = false, startX = 0, startY = 0;
let isSelecting = false, selStartX = 0, selStartY = 0;
let items = [], connections = [];
let selectedItems = new Set();
let selectedConn = null;
let highestZ = 1, itemId = 0;
let draggedItem = null, resizingItem = null;
let connectSource = null, connectHandle = null, tempLine = null;
let activeFilter = 'all';
let autoSaveTimer = null;
let canvases = [], currentCanvasId = null;
let minimapThrottle = null;
let sidebarPinned = localStorage.getItem('knotpad-sidebar-pinned') === 'true';
let iconPickerTarget = null;
let childPickerData = null;

// Undo/Redo
const MAX_HISTORY = 50;
let undoStack = [], redoStack = [];
function saveState() {
    const state = {
        items: items.map(i => ({ id: i.id, type: i.type, x: i.x, y: i.y, w: i.w, h: i.h, content: JSON.parse(JSON.stringify(i.content)), color: i.color, locked: i.locked, z: parseInt(i.el.style.zIndex) })),
        connections: connections.map(c => ({ id: c.id, from: c.from.id, fh: c.fh, to: c.to.id, th: c.th, dir: c.dir }))
    };
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
}
function updateUndoRedoButtons() {
    const undoBtn = $('undoBtn'), redoBtn = $('redoBtn');
    undoBtn.disabled = undoStack.length < 2;
    redoBtn.disabled = redoStack.length === 0;
    undoBtn.classList.toggle('disabled', undoStack.length < 2);
    redoBtn.classList.toggle('disabled', redoStack.length === 0);
}
function undo() {
    if (undoStack.length < 2) return;
    redoStack.push(undoStack.pop());
    restoreState(JSON.parse(undoStack[undoStack.length - 1]));
    updateUndoRedoButtons();
    triggerAutoSave();
}
function redo() {
    if (!redoStack.length) return;
    const state = redoStack.pop();
    undoStack.push(state);
    restoreState(JSON.parse(state));
    updateUndoRedoButtons();
    triggerAutoSave();
}
function restoreState(state) {
    connections.forEach(c => c.el.remove()); connections = [];
    items.forEach(i => i.el.remove()); items = [];
    selectedItems.clear(); selectedConn = null;
    const map = {};
    state.items.forEach(d => {
        if ((d.type === 'image' || d.type === 'video') && d.content?.startsWith('media_') && !blobURLCache.has(d.content)) return;
        const i = createItem(d, true);
        i.el.style.zIndex = d.z || 1;
        i.locked = d.locked;
        if (i.locked) i.el.classList.add('locked');
        map[d.id] = i;
    });
    state.connections.forEach(d => { if (map[d.from] && map[d.to]) { const c = addConnection(map[d.from], d.fh, map[d.to], d.th, true); c.dir = d.dir || 'none'; updateConnectionArrow(c); } });
    updateMinimap();
}

// Search
let searchResults = [], searchIndex = -1;
function openSearch() { searchBar.classList.add('active'); searchInput.focus(); }
function closeSearch() { searchBar.classList.remove('active'); searchInput.value = ''; clearSearchHighlights(); searchResults = []; updateSearchCount(); }
function clearSearchHighlights() { items.forEach(i => i.el.classList.remove('search-highlight')); }
function doSearch() {
    const q = searchInput.value.toLowerCase().trim();
    clearSearchHighlights();
    searchResults = [];
    if (!q) { updateSearchCount(); return; }
    items.forEach(item => {
        let text = '';
        if (item.type === 'note') text = (item.content.title + ' ' + item.content.body).toLowerCase();
        else if (item.type === 'memo') text = (item.content || '').toLowerCase();
        else if (item.type === 'link') text = (item.content.title + ' ' + item.content.url).toLowerCase();
        if (text.includes(q)) searchResults.push(item);
    });
    searchIndex = searchResults.length ? 0 : -1;
    updateSearchCount();
    highlightCurrentResult();
}
function updateSearchCount() { $('searchCount').textContent = searchResults.length ? `${searchIndex + 1}/${searchResults.length}` : '0/0'; }
function highlightCurrentResult() {
    clearSearchHighlights();
    if (searchIndex >= 0 && searchResults[searchIndex]) {
        const item = searchResults[searchIndex];
        item.el.classList.add('search-highlight');
        panToItem(item);
    }
}
function panToItem(item, animate = true) {
    const targetX = innerWidth / 2 - (item.x + item.w / 2) * scale;
    const targetY = innerHeight / 2 - (item.y + item.h / 2) * scale;
    if (animate) {
        const startX = offsetX, startY = offsetY, startTime = performance.now(), duration = 300;
        function animatePan(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            offsetX = startX + (targetX - startX) * ease;
            offsetY = startY + (targetY - startY) * ease;
            updateTransform();
            if (t < 1) requestAnimationFrame(animatePan);
            else updateMinimap();
        }
        requestAnimationFrame(animatePan);
    } else { offsetX = targetX; offsetY = targetY; updateTransform(); updateMinimap(); }
}
searchInput.addEventListener('input', doSearch);
$('searchPrev').addEventListener('click', () => { if (searchResults.length) { searchIndex = (searchIndex - 1 + searchResults.length) % searchResults.length; updateSearchCount(); highlightCurrentResult(); } });
$('searchNext').addEventListener('click', () => { if (searchResults.length) { searchIndex = (searchIndex + 1) % searchResults.length; updateSearchCount(); highlightCurrentResult(); } });
$('searchClose').addEventListener('click', closeSearch);

function triggerAutoSave() { if (autoSaveTimer) clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(saveCurrentCanvas, 1500); }
function esc(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }
function showToast(msg, type = 'success') { toast.textContent = msg; toast.className = 'toast ' + type; requestAnimationFrame(() => toast.classList.add('show')); setTimeout(() => toast.classList.remove('show'), 2000); }
function generateId() { return 'c' + Date.now() + Math.random().toString(36).substr(2, 5); }

// Canvas management
async function loadCanvases() {
    try {
        canvases = JSON.parse(localStorage.getItem(CANVASES_KEY) || '[]');
        if (!canvases.length) canvases = [{ id: generateId(), name: 'Untitled', createdAt: Date.now(), itemCount: 0 }];
        saveCanvasesList();
        const lastId = localStorage.getItem('knotpad-active-canvas');
        const target = canvases.find(c => c.id === lastId) || canvases[0];
        if (target) await switchCanvas(target.id);
        renderCanvasList();
    } catch (e) { console.error(e); }
}
function saveCanvasesList() { localStorage.setItem(CANVASES_KEY, JSON.stringify(canvases)); }
function saveCurrentCanvas() {
    if (!currentCanvasId) return;
    const data = {
        items: items.map(i => ({ id: i.id, type: i.type, x: i.x, y: i.y, w: i.w, h: i.h, content: i.content, color: i.color, locked: i.locked, z: parseInt(i.el.style.zIndex) })),
        connections: connections.map(c => ({ id: c.id, from: c.from.id, fh: c.fh, to: c.to.id, th: c.th, dir: c.dir })),
        view: { scale, offsetX, offsetY }, itemId, highestZ
    };
    try {
        localStorage.setItem('knotpad-data-' + currentCanvasId, JSON.stringify(data));
        const c = canvases.find(x => x.id === currentCanvasId);
        if (c) { c.updatedAt = Date.now(); c.itemCount = items.length; saveCanvasesList(); renderCanvasList(); }
    } catch (e) { showToast('Save failed', 'error'); }
}
async function loadCanvasData(id) {
    try {
        const saved = localStorage.getItem('knotpad-data-' + id);
        if (!saved) return;
        const data = JSON.parse(saved);
        itemId = data.itemId || 0; highestZ = data.highestZ || 1;
        if (data.view) { scale = data.view.scale; offsetX = data.view.offsetX; offsetY = data.view.offsetY; updateTransform(); }
        const mediaItems = data.items.filter(d => (d.type === 'image' || d.type === 'video') && d.content?.startsWith('media_'));
        for (const d of mediaItems) { if (!blobURLCache.has(d.content)) { const blob = await loadMedia(d.content); if (blob) blobURLCache.set(d.content, URL.createObjectURL(blob)); } }
        const map = {};
        data.items.forEach(d => { const i = createItem(d, true); i.el.style.zIndex = d.z || 1; i.locked = d.locked; if (i.locked) i.el.classList.add('locked'); map[d.id] = i; });
        data.connections.forEach(d => { if (map[d.from] && map[d.to]) { const c = addConnection(map[d.from], d.fh, map[d.to], d.th, true); c.dir = d.dir || 'none'; updateConnectionArrow(c); } });
        updateMinimap();
        undoStack = [JSON.stringify({ items: data.items, connections: data.connections.map(c => ({...c})) })];
        redoStack = [];
        updateUndoRedoButtons();
    } catch (e) { console.error(e); }
}
async function switchCanvas(id) {
    blobURLCache.forEach(url => URL.revokeObjectURL(url)); blobURLCache.clear();
    connections.forEach(c => { c.el.remove(); if (c.arrow) c.arrow.remove(); }); connections = [];
    items.forEach(i => i.el.remove()); items = [];
    selectedItems.clear(); selectedConn = null;
    itemId = highestZ = 1; scale = 1; offsetX = offsetY = 0;
    undoStack = []; redoStack = [];
    updateTransform();
    currentCanvasId = id;
    localStorage.setItem('knotpad-active-canvas', id);
    await loadCanvasData(id);
    if (!undoStack.length) { undoStack = [JSON.stringify({ items: [], connections: [] })]; }
    updateUndoRedoButtons();
    setFilter('all');
    updateMinimap();
    renderCanvasList();
}
async function createNewCanvas() {
    const nc = { id: generateId(), name: 'Untitled', createdAt: Date.now(), itemCount: 0 };
    canvases.unshift(nc); saveCanvasesList();
    await switchCanvas(nc.id);
}
async function deleteCanvas(id) {
    if (canvases.length <= 1) { showToast('Cannot delete last canvas', 'error'); return; }
    if (!confirm('Delete this canvas?')) return;
    const idx = canvases.findIndex(c => c.id === id);
    if (idx > -1) {
        canvases.splice(idx, 1);
        localStorage.removeItem('knotpad-data-' + id);
        saveCanvasesList();
        if (currentCanvasId === id) await switchCanvas(canvases[0].id);
        else renderCanvasList();
        showToast('Canvas deleted');
    }
}
function renameCanvas(id, name) { const c = canvases.find(x => x.id === id); if (c) { c.name = name || 'Untitled'; c.updatedAt = Date.now(); saveCanvasesList(); renderCanvasList(); } }
function getCanvasIconHTML(c) { if (c.icon && CANVAS_ICONS[c.icon]) return CANVAS_ICONS[c.icon]; return `<span class="icon-letter">${esc((c.name || 'U').charAt(0).toUpperCase())}</span>`; }
function renderCanvasList() {
    canvasList.innerHTML = canvases.map(c => `<div class="canvas-item-entry ${c.id === currentCanvasId ? 'active' : ''}" data-id="${c.id}"><div class="canvas-icon" data-canvas-id="${c.id}">${getCanvasIconHTML(c)}</div><div class="canvas-info"><div class="canvas-name">${esc(c.name)}</div><div class="canvas-meta">${c.itemCount || 0} items</div></div><div class="canvas-actions"><button class="canvas-action-btn rename" title="Rename"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="canvas-action-btn delete" title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button></div></div>`).join('');
    canvasList.querySelectorAll('.canvas-item-entry').forEach(entry => {
        const id = entry.dataset.id;
        entry.addEventListener('click', async e => { if (!e.target.closest('.canvas-action-btn') && !e.target.closest('.canvas-icon') && id !== currentCanvasId) { saveCurrentCanvas(); await switchCanvas(id); } });
        entry.querySelector('.rename').addEventListener('click', e => { e.stopPropagation(); startRename(entry, id); });
        entry.querySelector('.delete').addEventListener('click', e => { e.stopPropagation(); deleteCanvas(id); });
        entry.querySelector('.canvas-icon').addEventListener('click', e => { e.stopPropagation(); openIconPicker(id, entry); });
    });
}
function startRename(entry, id) {
    const nameEl = entry.querySelector('.canvas-name');
    const oldName = canvases.find(c => c.id === id)?.name || '';
    const input = document.createElement('input'); input.type = 'text'; input.className = 'canvas-name-input'; input.value = oldName;
    nameEl.replaceWith(input); input.focus(); input.select();
    const fin = () => renameCanvas(id, input.value.trim() || 'Untitled');
    input.addEventListener('blur', fin);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } if (e.key === 'Escape') { input.value = oldName; input.blur(); } });
}
function openIconPicker(canvasId, entry) {
    iconPickerTarget = canvasId;
    const canvas = canvases.find(c => c.id === canvasId);
    const rect = entry.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    canvasIconPicker.style.top = (rect.top - sidebarRect.top) + 'px';
    canvasIconPicker.querySelectorAll('.icon-opt').forEach(opt => opt.classList.toggle('selected', opt.dataset.icon === (canvas?.icon || '')));
    canvasIconPicker.classList.add('active');
}
function setCanvasIcon(canvasId, icon) { const c = canvases.find(x => x.id === canvasId); if (c) { c.icon = icon || null; c.updatedAt = Date.now(); saveCanvasesList(); renderCanvasList(); } }
canvasIconPicker.querySelectorAll('.icon-opt').forEach(opt => { opt.addEventListener('click', e => { e.stopPropagation(); if (iconPickerTarget) setCanvasIcon(iconPickerTarget, opt.dataset.icon); canvasIconPicker.classList.remove('active'); iconPickerTarget = null; }); });

// Theme
function loadTheme() { if (localStorage.getItem(THEME_KEY) === 'light') document.documentElement.classList.add('light'); updTheme(); }
function toggleTheme() { document.documentElement.classList.toggle('light'); localStorage.setItem(THEME_KEY, document.documentElement.classList.contains('light') ? 'light' : 'dark'); updTheme(); }
function updTheme() { const L = document.documentElement.classList.contains('light'); $('themeToggle').querySelector('.moon').style.display = L ? 'none' : 'block'; $('themeToggle').querySelector('.sun').style.display = L ? 'block' : 'none'; }

// Viewport
function updateTransform() { canvas.style.transform = `translate(${offsetX}px,${offsetY}px) scale(${scale})`; zoomDisplay.textContent = Math.round(scale * 100) + '%'; }
function setZoom(z, cx, cy) {
    cx = cx ?? innerWidth / 2; cy = cy ?? innerHeight / 2;
    z = Math.max(0.1, Math.min(5, z));
    offsetX = cx - (cx - offsetX) * (z / scale);
    offsetY = cy - (cy - offsetY) * (z / scale);
    scale = z; updateTransform(); throttledMinimap();
}
function fitToScreen() {
    if (!items.length) { scale = 1; offsetX = offsetY = 0; updateTransform(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(i => { minX = Math.min(minX, i.x); minY = Math.min(minY, i.y); maxX = Math.max(maxX, i.x + i.w); maxY = Math.max(maxY, i.y + i.h); });
    const padX = 60, padY = 80;
    const cw = maxX - minX + padX * 2, ch = maxY - minY + padY * 2;
    const newScale = Math.min(Math.min((innerWidth - 60) / cw, (innerHeight - 120) / ch), 2) * 0.92;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const targetScale = newScale;
    const targetX = innerWidth / 2 - cx * targetScale;
    const targetY = (innerHeight - 60) / 2 - cy * targetScale;
    const startScale = scale, startX = offsetX, startY = offsetY;
    const startTime = performance.now(), duration = 250;
    function animate(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        scale = startScale + (targetScale - startScale) * ease;
        offsetX = startX + (targetX - startX) * ease;
        offsetY = startY + (targetY - startY) * ease;
        updateTransform();
        if (t < 1) requestAnimationFrame(animate);
        else { zoomDisplay.textContent = Math.round(scale * 100) + '%'; updateMinimap(); }
    }
    requestAnimationFrame(animate);
}
function throttledMinimap() { if (minimapThrottle) return; minimapThrottle = requestAnimationFrame(() => { updateMinimap(); minimapThrottle = null; }); }

// Wheel - zoom canvas or scroll textarea
app.addEventListener('wheel', e => {
    const t = e.target;
    if (t.classList.contains('note-body') || t.classList.contains('memo-body')) {
        if (t.scrollHeight > t.clientHeight) return;
    }
    e.preventDefault();
    const d = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = app.getBoundingClientRect();
    setZoom(scale * d, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

// Mouse handling
app.addEventListener('mousedown', e => {
    app.focus();
    closeSidebarIfUnpinned();
    if (e.button === 1) { e.preventDefault(); startPan(e.clientX, e.clientY); return; }
    if (e.button === 0 && (e.target === canvas || e.target.classList.contains('grid-overlay') || e.target === app)) {
        if (!e.shiftKey) deselectAll();
        isSelecting = true;
        selStartX = e.clientX; selStartY = e.clientY;
        selectionBox.style.display = 'block';
        selectionBox.style.left = selStartX + 'px'; selectionBox.style.top = selStartY + 'px';
        selectionBox.style.width = '0px'; selectionBox.style.height = '0px';
    }
});
function startPan(x, y) { isPanning = true; startX = x - offsetX; startY = y - offsetY; app.classList.add('panning'); }
function closeSidebarIfUnpinned() { if (!sidebarPinned && sidebar.classList.contains('open')) sidebar.classList.remove('open'); }

window.addEventListener('mousemove', e => {
    if (isPanning) { offsetX = e.clientX - startX; offsetY = e.clientY - startY; updateTransform(); throttledMinimap(); return; }
    if (isSelecting) {
        const minX = Math.min(selStartX, e.clientX), maxX = Math.max(selStartX, e.clientX);
        const minY = Math.min(selStartY, e.clientY), maxY = Math.max(selStartY, e.clientY);
        selectionBox.style.left = minX + 'px'; selectionBox.style.top = minY + 'px';
        selectionBox.style.width = (maxX - minX) + 'px'; selectionBox.style.height = (maxY - minY) + 'px';
        return;
    }
    if (draggedItem) {
        const rect = app.getBoundingClientRect();
        const curX = (e.clientX - rect.left - offsetX) / scale, curY = (e.clientY - rect.top - offsetY) / scale;
        const newX = curX - draggedItem.ox, newY = curY - draggedItem.oy;
        const dx = newX - draggedItem.x, dy = newY - draggedItem.y;
        selectedItems.forEach(item => { item.x += dx; item.y += dy; item.el.style.left = item.x + 'px'; item.el.style.top = item.y + 'px'; });
        updateAllConnections(); throttledMinimap();
    }
    if (resizingItem) {
        const rect = app.getBoundingClientRect();
        const x = (e.clientX - rect.left - offsetX) / scale, y = (e.clientY - rect.top - offsetY) / scale;
        resizingItem.w = Math.max(140, x - resizingItem.x); resizingItem.h = Math.max(80, y - resizingItem.y);
        resizingItem.el.style.width = resizingItem.w + 'px'; resizingItem.el.style.height = resizingItem.h + 'px';
        updateAllConnections(); throttledMinimap();
    }
    if (tempLine) {
        const rect = app.getBoundingClientRect();
        updateTempLine((e.clientX - rect.left - offsetX) / scale + 10000, (e.clientY - rect.top - offsetY) / scale + 10000);
    }
});

window.addEventListener('mouseup', e => {
    if (isPanning) { isPanning = false; app.classList.remove('panning'); }
    if (isSelecting) {
        isSelecting = false;
        const sb = selectionBox.getBoundingClientRect();
        selectionBox.style.display = 'none';
        if (sb.width > 2 && sb.height > 2) {
            const rect = app.getBoundingClientRect();
            const bx = (sb.left - rect.left - offsetX) / scale, by = (sb.top - rect.top - offsetY) / scale;
            const bw = sb.width / scale, bh = sb.height / scale;
            items.forEach(item => { if (item.x < bx + bw && item.x + item.w > bx && item.y < by + bh && item.y + item.h > by) selectItem(item, true); });
        }
    }
    if (draggedItem || resizingItem) {
        if (draggedItem) { selectedItems.forEach(i => i.el.classList.remove('dragging')); canvas.classList.remove('dragging-item'); saveState(); draggedItem = null; }
        if (resizingItem) { saveState(); resizingItem = null; }
        triggerAutoSave();
    }
});

// Touch
let lastDist = 0;
app.addEventListener('touchstart', e => {
    closeSidebarIfUnpinned();
    if (e.touches.length === 2) lastDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
    else if (e.touches.length === 1 && (e.target === canvas || e.target === app)) { isPanning = true; startX = e.touches[0].clientX - offsetX; startY = e.touches[0].clientY - offsetY; }
});
app.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = app.getBoundingClientRect();
        setZoom(scale * dist / lastDist, cx - rect.left, cy - rect.top);
        lastDist = dist;
    } else if (isPanning) { offsetX = e.touches[0].clientX - startX; offsetY = e.touches[0].clientY - startY; updateTransform(); throttledMinimap(); }
}, { passive: false });
app.addEventListener('touchend', () => isPanning = false);

// Item creation
function createItem(cfg, loading = false) {
    const el = document.createElement('div');
    el.className = 'canvas-item' + (loading ? '' : ' new');
    el.style.cssText = `left:${cfg.x}px;top:${cfg.y}px;width:${cfg.w}px;height:${cfg.h}px;z-index:${++highestZ}`;
    let html = '', mediaSrc = '';
    if ((cfg.type === 'image' || cfg.type === 'video') && cfg.content) mediaSrc = cfg.content.startsWith('media_') ? (blobURLCache.get(cfg.content) || '') : cfg.content;
    switch (cfg.type) {
        case 'image': html = `<img class="item-image" src="${mediaSrc}">`; break;
        case 'video': html = `<video class="item-video" src="${mediaSrc}" controls></video>`; break;
        case 'note': html = `<div class="item-note"><input class="note-title" placeholder="Title..." value="${esc(cfg.content.title)}"><textarea class="note-body" placeholder="Write something...">${esc(cfg.content.body)}</textarea></div>`; break;
        case 'memo': html = `<div class="item-memo"><textarea class="memo-body" placeholder="Quick memo...">${esc(cfg.content)}</textarea></div>`; break;
        case 'link': html = `<div class="item-link"><img class="link-favicon" src="https://www.google.com/s2/favicons?domain=${new URL(cfg.content.url).hostname}&sz=64"><div class="link-title">${esc(cfg.content.title)}</div><a class="link-url" href="${cfg.content.url}" target="_blank">${cfg.content.display}</a></div>`; break;
    }
    if (cfg.color) {
        el.style.setProperty('--tag-color', COLOR_MAP[cfg.color]);
        el.classList.add('has-color');
    }
    el.innerHTML = `<div class="color-dot"></div><div class="item-content">${html}</div><button class="delete-btn">×</button><button class="color-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg></button><div class="color-picker"><div class="color-opt none" data-color="" title="None"></div>${COLORS.map(c => `<div class="color-opt" data-color="${c}" style="background:${COLOR_MAP[c]}" title="${c}"></div>`).join('')}</div><div class="resize-handle"></div><div class="connection-handle top" data-h="top"></div><div class="connection-handle bottom" data-h="bottom"></div><div class="connection-handle left" data-h="left"></div><div class="connection-handle right" data-h="right"></div><button class="add-child-btn top" data-d="top">+</button><button class="add-child-btn bottom" data-d="bottom">+</button><button class="add-child-btn left" data-d="left">+</button><button class="add-child-btn right" data-d="right">+</button>`;
    canvas.appendChild(el);
    const item = { id: cfg.id || `i${++itemId}`, el, type: cfg.type, x: cfg.x, y: cfg.y, w: cfg.w, h: cfg.h, content: cfg.content, color: cfg.color || null, locked: cfg.locked || false };
    items.push(item);
    setupItemEvents(item);
    if (!loading) { throttledMinimap(); if (activeFilter !== 'all' && item.color !== activeFilter) item.el.classList.add('filtered-out'); }
    setTimeout(() => el.classList.remove('new'), 200);
    return item;
}

function setItemColor(targetItem, color) {
    const targets = selectedItems.size > 0 ? selectedItems : new Set([targetItem]);
    targets.forEach(item => {
        item.color = color || null;
        if (color) {
            item.el.style.setProperty('--tag-color', COLOR_MAP[color]);
            item.el.classList.add('has-color');
        } else {
            item.el.style.setProperty('--tag-color', 'transparent');
            item.el.classList.remove('has-color');
        }
        item.el.querySelectorAll('.color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === (color || '')));
        if (activeFilter !== 'all') item.el.classList.toggle('filtered-out', item.color !== activeFilter);
        // Update connections from this node
        connections.filter(c => c.from === item).forEach(updateConnection);
    });
    throttledMinimap(); saveState(); triggerAutoSave();
}

function setupItemEvents(item) {
    const el = item.el;
    el.addEventListener('mousedown', e => {
        const t = e.target;
        if (t.classList.contains('delete-btn') || t.classList.contains('resize-handle') || t.classList.contains('connection-handle') || t.classList.contains('add-child-btn') || t.classList.contains('color-btn') || t.classList.contains('color-opt') || t.closest('.color-picker') || t.tagName === 'VIDEO' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
        if (item.locked) return;
        e.stopPropagation();
        if (!selectedItems.has(item) && !e.shiftKey) selectItem(item, false);
        else if (e.shiftKey) { if (selectedItems.has(item)) selectedItems.delete(item); else selectedItems.add(item); item.el.classList.toggle('selected'); }
        else selectItem(item, true);
        el.style.zIndex = ++highestZ;
        const rect = el.getBoundingClientRect();
        item.ox = (e.clientX - rect.left) / scale; item.oy = (e.clientY - rect.top) / scale;
        draggedItem = item;
        selectedItems.forEach(i => i.el.classList.add('dragging'));
        canvas.classList.add('dragging-item');
    });
    el.querySelector('.resize-handle').addEventListener('mousedown', e => { if (item.locked) return; e.stopPropagation(); resizingItem = item; });
    el.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); if (selectedItems.has(item)) deleteSelectedItems(); else deleteItem(item); });
    const colorBtnEl = el.querySelector('.color-btn'), colorPicker = el.querySelector('.color-picker');
    colorBtnEl.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.color-picker.active').forEach(p => { if (p !== colorPicker) p.classList.remove('active'); });
        colorPicker.classList.toggle('active');
        colorPicker.querySelectorAll('.color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === (item.color || '')));
    });
    colorPicker.querySelectorAll('.color-opt').forEach(opt => { opt.addEventListener('click', e => { e.stopPropagation(); setItemColor(item, opt.dataset.color || null); colorPicker.classList.remove('active'); }); });
    el.querySelectorAll('.add-child-btn').forEach(btn => { btn.addEventListener('click', e => { e.stopPropagation(); showChildTypePicker(item, btn.dataset.d, e); }); });
    el.querySelectorAll('.connection-handle').forEach(h => {
        h.addEventListener('mousedown', e => { e.stopPropagation(); if (connectSource) completeConnection(item, h.dataset.h); else startConnection(item, h.dataset.h); });
        h.addEventListener('mouseenter', () => { if (connectSource && connectSource !== item) el.classList.add('connect-target'); });
        h.addEventListener('mouseleave', () => el.classList.remove('connect-target'));
    });
    el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); if (!selectedItems.has(item)) selectItem(item); showContextMenu(e.clientX, e.clientY, item); });
    if (item.type === 'note') {
        const ti = el.querySelector('.note-title'), tb = el.querySelector('.note-body');
        ti.addEventListener('input', () => { item.content.title = ti.value; autoResizeItem(item); triggerAutoSave(); });
        tb.addEventListener('input', () => { item.content.body = tb.value; autoResizeItem(item); triggerAutoSave(); });
    }
    if (item.type === 'memo') {
        const mb = el.querySelector('.memo-body');
        mb.addEventListener('input', () => { item.content = mb.value; autoResizeItem(item); triggerAutoSave(); });
    }
}

function autoResizeItem(item) {
    if (item.type !== 'note' && item.type !== 'memo') return;
    const textarea = item.el.querySelector('.note-body, .memo-body');
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newH = Math.min(Math.max(textarea.scrollHeight + (item.type === 'note' ? 50 : 24), 80), 400);
    if (Math.abs(newH - item.h) > 10) {
        item.h = newH;
        item.el.style.height = item.h + 'px';
        updateAllConnections();
        throttledMinimap();
    }
}

function showChildTypePicker(parentItem, direction, e) {
    childPickerData = { parent: parentItem, dir: direction };
    childTypePicker.style.left = e.clientX + 'px'; childTypePicker.style.top = e.clientY + 'px';
    childTypePicker.classList.add('active');
}
childTypePicker.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!childPickerData) return;
        addChildNode(childPickerData.parent, childPickerData.dir, btn.dataset.type);
        childTypePicker.classList.remove('active');
        childPickerData = null;
    });
});

function selectItem(item, accumulate = false) { if (!accumulate) deselectAll(); selectedItems.add(item); item.el.classList.add('selected'); window.selectedItem = item; }
function deselectAll() {
    selectedItems.forEach(i => i.el.classList.remove('selected')); selectedItems.clear(); window.selectedItem = null;
    if (selectedConn) { selectedConn.el.classList.remove('selected'); if (selectedConn.arrow) selectedConn.arrow.classList.remove('selected'); selectedConn = null; }
    hideMenus(); document.querySelectorAll('.color-picker.active').forEach(p => p.classList.remove('active'));
}
function deleteSelectedItems() { if (!selectedItems.size) return; saveState(); selectedItems.forEach(item => deleteItem(item, false)); selectedItems.clear(); throttledMinimap(); triggerAutoSave(); }
function deleteItem(item, update = true) {
    connections.filter(c => c.from === item || c.to === item).forEach(c => deleteConnection(c, false));
    if ((item.type === 'image' || item.type === 'video') && item.content?.startsWith('media_')) { deleteMedia(item.content); const url = blobURLCache.get(item.content); if (url) { URL.revokeObjectURL(url); blobURLCache.delete(item.content); } }
    const i = items.indexOf(item); if (i > -1) { items.splice(i, 1); item.el.remove(); }
    if (update) { saveState(); throttledMinimap(); triggerAutoSave(); }
}
function duplicateItem(item) { const pos = findFreePosition(item.x + 24, item.y + 24); createItem({ type: item.type, x: pos.x, y: pos.y, w: item.w, h: item.h, content: JSON.parse(JSON.stringify(item.content)), color: item.color }); saveState(); triggerAutoSave(); }
function findFreePosition(x, y) { let tries = 0; while (tries < 50 && items.some(i => Math.abs(x - i.x) < 10 && Math.abs(y - i.y) < 10)) { x += 6; y += 6; tries++; } return { x, y }; }

// Connections
function startConnection(item, handle) {
    connectSource = item; connectHandle = handle;
    canvas.classList.add('connecting');
    const pos = getHandlePos(item, handle);
    tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempLine.classList.add('connection-line', 'temp');
    if (item.color && COLOR_MAP[item.color]) {
        tempLine.style.stroke = COLOR_MAP[item.color];
    }
    connectionsSvg.appendChild(tempLine);
    updateTempLine(pos.x, pos.y);
}
function updateTempLine(ex, ey) { if (!tempLine || !connectSource) return; const sp = getHandlePos(connectSource, connectHandle); tempLine.setAttribute('d', curvePath(sp.x, sp.y, ex, ey)); }
function completeConnection(target, handle) {
    if (!connectSource || connectSource === target) { cancelConnection(); return; }
    // Remove existing connection between these items if different handles
    const existing = connections.find(c => (c.from === connectSource && c.to === target) || (c.from === target && c.to === connectSource));
    if (existing) deleteConnection(existing, false);
    addConnection(connectSource, connectHandle, target, handle);
    cancelConnection();
    saveState();
}
function cancelConnection() { if (tempLine) { tempLine.remove(); tempLine = null; } connectSource = connectHandle = null; canvas.classList.remove('connecting'); items.forEach(i => i.el.classList.remove('connect-target')); }
function addConnection(from, fh, to, th, loading = false) {
    const conn = { id: `c${Date.now()}`, from, fh, to, th, el: null, arrow: null, dir: 'none' };
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection-line');
    path.addEventListener('click', e => { e.stopPropagation(); selectConnection(conn, e); });
    connectionsSvg.appendChild(path);
    conn.el = path;
    connections.push(conn);
    updateConnection(conn);
    if (!loading) { throttledMinimap(); triggerAutoSave(); }
    return conn;
}
function updateConnection(c) {
    const fp = getHandlePos(c.from, c.fh), tp = getHandlePos(c.to, c.th);
    c.el.setAttribute('d', curvePath(fp.x, fp.y, tp.x, tp.y));
    // Apply color from source node
    if (c.from.color && COLOR_MAP[c.from.color]) {
        c.el.style.stroke = COLOR_MAP[c.from.color];
    } else {
        c.el.style.stroke = '';
    }
    updateConnectionArrow(c);
}
function updateConnectionArrow(c) {
    if (c.arrow) { c.arrow.remove(); c.arrow = null; }
    if (c.dir === 'none') return;
    const fp = getHandlePos(c.from, c.fh), tp = getHandlePos(c.to, c.th);
    const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2;
    const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('connection-arrow');
    if (selectedConn === c) g.classList.add('selected');
    // Apply color from source node
    if (c.from.color && COLOR_MAP[c.from.color]) {
        g.style.fill = COLOR_MAP[c.from.color];
    }
    const size = 8;
    if (c.dir === 'forward' || c.dir === 'both') {
        const arr = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const x = mx + 10, y = my;
        arr.setAttribute('points', `${x},${y} ${x - size},${y - size / 2} ${x - size},${y + size / 2}`);
        arr.setAttribute('transform', `rotate(${angle * 180 / Math.PI}, ${mx}, ${my})`);
        g.appendChild(arr);
    }
    if (c.dir === 'backward' || c.dir === 'both') {
        const arr = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const x = mx - 10, y = my;
        arr.setAttribute('points', `${x},${y} ${x + size},${y - size / 2} ${x + size},${y + size / 2}`);
        arr.setAttribute('transform', `rotate(${angle * 180 / Math.PI}, ${mx}, ${my})`);
        g.appendChild(arr);
    }
    connectionsSvg.appendChild(g);
    c.arrow = g;
}
function updateAllConnections() { connections.forEach(updateConnection); }
function getHandlePos(item, h) {
    const { x, y, w, h: ih } = item, off = 10000;
    switch (h) { case 'top': return { x: x + w / 2 + off, y: y + off }; case 'bottom': return { x: x + w / 2 + off, y: y + ih + off }; case 'left': return { x: x + off, y: y + ih / 2 + off }; case 'right': return { x: x + w + off, y: y + ih / 2 + off }; }
}
function curvePath(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1, dist = Math.sqrt(dx * dx + dy * dy), curve = Math.min(dist * 0.3, 80); return `M${x1} ${y1} C${x1 + curve * Math.sign(dx || 1)} ${y1}, ${x2 - curve * Math.sign(dx || 1)} ${y2}, ${x2} ${y2}`; }
function selectConnection(c, e) {
    deselectAll(); selectedConn = c; c.el.classList.add('selected'); if (c.arrow) c.arrow.classList.add('selected');
    showConnDirectionPicker(e.clientX, e.clientY, c);
}
function deleteConnection(c, save = true) {
    const i = connections.indexOf(c);
    if (i > -1) { connections.splice(i, 1); c.el.remove(); if (c.arrow) c.arrow.remove(); selectedConn = null; if (save) { saveState(); triggerAutoSave(); } throttledMinimap(); }
}
function showConnDirectionPicker(x, y, conn) {
    connDirectionPicker.style.left = x + 'px'; connDirectionPicker.style.top = y + 'px';
    connDirectionPicker.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.dir === conn.dir));
    connDirectionPicker.classList.add('active');
}
connDirectionPicker.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', e => {
        e.stopPropagation();
        if (selectedConn) { selectedConn.dir = btn.dataset.dir; updateConnectionArrow(selectedConn); saveState(); triggerAutoSave(); }
        connDirectionPicker.classList.remove('active');
    });
});
function addChildNode(parent, dir, type = 'note') {
    const gap = 72, cw = type === 'note' ? 220 : 180, ch = type === 'note' ? 140 : 100;
    let x, y, fh, th;
    switch (dir) {
        case 'top': x = parent.x + parent.w / 2 - cw / 2; y = parent.y - ch - gap; fh = 'top'; th = 'bottom'; break;
        case 'bottom': x = parent.x + parent.w / 2 - cw / 2; y = parent.y + parent.h + gap; fh = 'bottom'; th = 'top'; break;
        case 'left': x = parent.x - cw - gap; y = parent.y + parent.h / 2 - ch / 2; fh = 'left'; th = 'right'; break;
        case 'right': x = parent.x + parent.w + gap; y = parent.y + parent.h / 2 - ch / 2; fh = 'right'; th = 'left'; break;
    }
    const child = type === 'memo' ? addMemo('', x, y, parent.color) : addNote('', '', x, y, parent.color);
    addConnection(parent, fh, child, th);
    saveState();
    return child;
}

// Filter
function setFilter(color) {
    activeFilter = color;
    filterDropdown.querySelectorAll('.filter-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === color));
    filterBtn.classList.toggle('filter-active', color !== 'all');
    items.forEach(item => item.el.classList.toggle('filtered-out', color !== 'all' && item.color !== color));
    throttledMinimap();
}

// Context menu
function showContextMenu(x, y, item) {
    contextMenu.querySelector('[data-action="lock"]').textContent = item.locked ? 'Unlock' : 'Lock to Back';
    contextMenu.style.left = x + 'px'; contextMenu.style.top = y + 'px';
    contextMenu.classList.add('active');
}
function hideMenus() { contextMenu.classList.remove('active'); filterDropdown.classList.remove('active'); colorDropdown.classList.remove('active'); connDirectionPicker.classList.remove('active'); childTypePicker.classList.remove('active'); canvasIconPicker.classList.remove('active'); }

document.addEventListener('click', e => {
    if (!e.target.closest('.color-picker') && !e.target.closest('.color-btn')) document.querySelectorAll('.color-picker.active').forEach(p => p.classList.remove('active'));
    if (!e.target.closest('#filterBtn') && !e.target.closest('#filterDropdown')) filterDropdown.classList.remove('active');
    if (!e.target.closest('#colorBtn') && !e.target.closest('#colorDropdown')) colorDropdown.classList.remove('active');
    if (!e.target.closest('.context-menu')) contextMenu.classList.remove('active');
    if (!e.target.closest('.conn-direction-picker') && !e.target.closest('.connection-line')) connDirectionPicker.classList.remove('active');
    if (!e.target.closest('.child-type-picker') && !e.target.closest('.add-child-btn')) childTypePicker.classList.remove('active');
    if (!e.target.closest('.canvas-icon-picker') && !e.target.closest('.canvas-icon')) { canvasIconPicker.classList.remove('active'); iconPickerTarget = null; }
});

contextMenu.querySelectorAll('.context-menu-item').forEach(el => {
    el.addEventListener('click', () => {
        if (window.selectedItem) {
            switch (el.dataset.action) {
                case 'duplicate': duplicateItem(window.selectedItem); break;
                case 'lock': window.selectedItem.locked = !window.selectedItem.locked; window.selectedItem.el.classList.toggle('locked', window.selectedItem.locked); if (window.selectedItem.locked) window.selectedItem.el.style.zIndex = 1; saveState(); triggerAutoSave(); break;
                case 'delete': if (selectedItems.size > 0) deleteSelectedItems(); else deleteItem(window.selectedItem); break;
            }
        }
        hideMenus();
    });
});

filterBtn.addEventListener('click', e => { e.stopPropagation(); colorDropdown.classList.remove('active'); filterDropdown.classList.toggle('active'); });
filterDropdown.querySelectorAll('.filter-opt').forEach(opt => { opt.addEventListener('click', e => { e.stopPropagation(); setFilter(opt.dataset.color); filterDropdown.classList.remove('active'); }); });
colorBtn.addEventListener('click', e => { e.stopPropagation(); filterDropdown.classList.remove('active'); colorDropdown.classList.toggle('active'); });
colorDropdown.querySelectorAll('.color-opt').forEach(opt => {
    opt.addEventListener('click', e => {
        e.stopPropagation();
        if (selectedItems.size > 0) { setItemColor([...selectedItems][0], opt.dataset.color || null); }
        colorDropdown.classList.remove('active');
    });
});

// Link modal
function openLinkModal() { linkModal.classList.add('active'); setTimeout(() => $('linkUrl').focus(), 100); }
function closeLinkModal() { linkModal.classList.remove('active'); $('linkTitle').value = ''; $('linkUrl').value = ''; }
linkModal.addEventListener('click', e => { if (e.target === linkModal) closeLinkModal(); });
linkModal.querySelector('[data-close]').addEventListener('click', closeLinkModal);
$('linkSubmit').addEventListener('click', () => {
    let url = $('linkUrl').value.trim();
    if (url) { if (!url.startsWith('http')) url = 'https://' + url; const x = (innerWidth / 2 - offsetX) / scale - 130, y = (innerHeight / 2 - offsetY) / scale - 50; addLink(url, $('linkTitle').value.trim(), x, y); saveState(); closeLinkModal(); }
});

// Export directly
$('exportBtn').addEventListener('click', async () => {
    const data = {
        items: items.map(i => ({ id: i.id, type: i.type, x: i.x, y: i.y, w: i.w, h: i.h, content: i.content, color: i.color, locked: i.locked })),
        connections: connections.map(c => ({ from: c.from.id, fh: c.fh, to: c.to.id, th: c.th, dir: c.dir })),
        name: canvases.find(c => c.id === currentCanvasId)?.name || 'canvas'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${data.name}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Exported');
});
$('importBtn').addEventListener('click', () => $('importInput').click());
$('importInput').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        connections.forEach(c => { c.el.remove(); if (c.arrow) c.arrow.remove(); }); connections = [];
        items.forEach(i => i.el.remove()); items = [];
        selectedItems.clear(); itemId = highestZ = 1;
        const map = {};
        data.items.forEach(d => { const i = createItem(d, true); map[d.id] = i; });
        data.connections.forEach(d => { if (map[d.from] && map[d.to]) { const c = addConnection(map[d.from], d.fh, map[d.to], d.th, true); c.dir = d.dir || 'none'; updateConnectionArrow(c); } });
        updateMinimap(); saveState(); triggerAutoSave();
        showToast('Imported');
    } catch (err) { showToast('Import failed', 'error'); }
    e.target.value = '';
});

// Keyboard
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); openSearch(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape') { cancelConnection(); closeLinkModal(); closeSearch(); deselectAll(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input,textarea')) {
        if (selectedItems.size > 0) deleteSelectedItems();
        else if (selectedConn) deleteConnection(selectedConn);
    }
});

// Drag & Drop & Paste
window.addEventListener('dragenter', e => { e.preventDefault(); dropZone.classList.add('active'); });
window.addEventListener('dragleave', e => { e.preventDefault(); dropZone.classList.remove('active'); });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('active');
    const rect = app.getBoundingClientRect();
    const x = (e.clientX - rect.left - offsetX) / scale - 100, y = (e.clientY - rect.top - offsetY) / scale - 70;
    if (e.dataTransfer.files.length) [...e.dataTransfer.files].forEach((f, i) => handleFile(f, x + i * 24, y + i * 24));
    else { const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (url?.startsWith('http')) { addLink(url, '', x, y); saveState(); triggerAutoSave(); } }
});
window.addEventListener('paste', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    const cd = e.clipboardData; if (!cd) return;
    const x = (innerWidth / 2 - offsetX) / scale - 100, y = (innerHeight / 2 - offsetY) / scale - 100;
    for (let i = 0; i < cd.items.length; i++) {
        const item = cd.items[i];
        if (item.type.indexOf('image') !== -1) handleFile(item.getAsFile(), x + i * 20, y + i * 20);
        else if (item.kind === 'string' && item.type.indexOf('text/plain') !== -1) {
            item.getAsString(text => { text = text.trim(); if (!text) return; if (/^https?:\/\/[^ "]+$/.test(text)) addLink(text, '', x, y); else addMemo(text, x, y); saveState(); triggerAutoSave(); });
        }
    }
});

async function handleFile(file, x, y) {
    const mediaId = 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
            let w = img.width, h = img.height;
            if (w > 400) { h = 400 / w * h; w = 400; } if (h > 300) { w = 300 / h * w; h = 300; }
            URL.revokeObjectURL(url);
            await saveMedia(mediaId, file); blobURLCache.set(mediaId, URL.createObjectURL(file));
            createItem({ type: 'image', x, y, w, h, content: mediaId }); saveState(); triggerAutoSave();
        };
        img.src = url;
    } else if (file.type.startsWith('video/')) {
        await saveMedia(mediaId, file); blobURLCache.set(mediaId, URL.createObjectURL(file));
        createItem({ type: 'video', x, y, w: 400, h: 225, content: mediaId }); saveState(); triggerAutoSave();
    }
}
function addLink(url, title, x, y) { const domain = new URL(url).hostname; const item = createItem({ type: 'link', x, y, w: 260, h: 100, content: { url, title: title || domain, display: url.replace(/^https?:\/\//, '').replace(/\/$/, '') } }); triggerAutoSave(); return item; }
function addNote(title = '', body = '', x, y, color = null) { const pos = findFreePosition(x, y); const item = createItem({ type: 'note', x: pos.x, y: pos.y, w: 220, h: 140, content: { title, body }, color }); triggerAutoSave(); return item; }
function addMemo(text = '', x, y, color = null) { const pos = findFreePosition(x, y); const item = createItem({ type: 'memo', x: pos.x, y: pos.y, w: 180, h: 100, content: text, color }); triggerAutoSave(); return item; }

// Toolbar
$('addNoteBtn').addEventListener('click', () => { const x = (innerWidth / 2 - offsetX) / scale - 110, y = (innerHeight / 2 - offsetY) / scale - 70; addNote('', '', x, y); saveState(); });
$('addMemoBtn').addEventListener('click', () => { const x = (innerWidth / 2 - offsetX) / scale - 90, y = (innerHeight / 2 - offsetY) / scale - 50; addMemo('', x, y); saveState(); });
$('addLinkBtn').addEventListener('click', openLinkModal);
$('addFileBtn').addEventListener('click', () => fileInput.click());
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
$('zoomInBtn').addEventListener('click', () => setZoom(scale * 1.25));
$('zoomOutBtn').addEventListener('click', () => setZoom(scale / 1.25));
$('fitViewBtn').addEventListener('click', fitToScreen);
$('themeToggle').addEventListener('click', toggleTheme);
fileInput.addEventListener('change', e => { if (e.target.files.length) { const x = (innerWidth / 2 - offsetX) / scale - 100, y = (innerHeight / 2 - offsetY) / scale - 70; [...e.target.files].forEach((f, i) => handleFile(f, x + i * 24, y + i * 24)); fileInput.value = ''; } });

sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
if (sidebarPinned) sidebarPinBtn.classList.add('pinned');
sidebarPinBtn.addEventListener('click', e => { e.stopPropagation(); sidebarPinned = !sidebarPinned; sidebarPinBtn.classList.toggle('pinned', sidebarPinned); localStorage.setItem('knotpad-sidebar-pinned', sidebarPinned); });
$('addCanvasBtn').addEventListener('click', () => { saveCurrentCanvas(); createNewCanvas(); });

// Minimap click navigation
minimap.addEventListener('click', e => {
    if (!items.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(i => { minX = Math.min(minX, i.x); minY = Math.min(minY, i.y); maxX = Math.max(maxX, i.x + i.w); maxY = Math.max(maxY, i.y + i.h); });
    minX -= 80; minY -= 80; maxX += 80; maxY += 80;
    const rect = minimap.getBoundingClientRect();
    const sx = (maxX - minX) / 160, sy = (maxY - minY) / 100;
    const clickX = (e.clientX - rect.left) * sx + minX;
    const clickY = (e.clientY - rect.top) * sy + minY;
    const targetX = innerWidth / 2 - clickX * scale, targetY = innerHeight / 2 - clickY * scale;
    const startX = offsetX, startY = offsetY, startTime = performance.now(), duration = 200;
    function animate(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        offsetX = startX + (targetX - startX) * ease;
        offsetY = startY + (targetY - startY) * ease;
        updateTransform();
        if (t < 1) requestAnimationFrame(animate);
        else updateMinimap();
    }
    requestAnimationFrame(animate);
});

function updateMinimap() {
    const visible = items.filter(i => !i.el.classList.contains('filtered-out'));
    if (!visible.length) { minimapContent.innerHTML = '<div class="minimap-viewport"></div>'; return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visible.forEach(i => { minX = Math.min(minX, i.x); minY = Math.min(minY, i.y); maxX = Math.max(maxX, i.x + i.w); maxY = Math.max(maxY, i.y + i.h); });
    minX -= 80; minY -= 80; maxX += 80; maxY += 80;
    const s = Math.min(160 / (maxX - minX), 100 / (maxY - minY));
    let html = '<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">';
    connections.forEach(c => {
        if (c.from.el.classList.contains('filtered-out') || c.to.el.classList.contains('filtered-out')) return;
        const fx = (c.from.x + c.from.w / 2 - minX) * s, fy = (c.from.y + c.from.h / 2 - minY) * s;
        const tx = (c.to.x + c.to.w / 2 - minX) * s, ty = (c.to.y + c.to.h / 2 - minY) * s;
        html += `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="var(--accent-dim)" stroke-width="1"/>`;
    });
    html += '</svg>';
    visible.forEach(i => { const bg = i.color ? COLOR_MAP[i.color] : 'var(--text-secondary)'; html += `<div class="minimap-item" style="left:${(i.x - minX) * s}px;top:${(i.y - minY) * s}px;width:${Math.max(3, i.w * s)}px;height:${Math.max(2, i.h * s)}px;background:${bg}"></div>`; });
    const vx = (-offsetX / scale - minX) * s, vy = (-offsetY / scale - minY) * s;
    html += `<div class="minimap-viewport" style="left:${vx}px;top:${vy}px;width:${innerWidth / scale * s}px;height:${innerHeight / scale * s}px"></div>`;
    minimapContent.innerHTML = html;
}

// Init
loadTheme();
updateTransform();
updateUndoRedoButtons();
initMediaDB().then(() => loadCanvases()).catch(e => { console.error(e); loadCanvases(); });

// Register Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registered'))
        .catch(err => console.log('SW registration failed:', err));
}
})();
