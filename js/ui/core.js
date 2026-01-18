// KnotPad - UI Core Module
// Pure utilities with NO dependencies on other UI modules
// Dependency direction: external modules only

import { THEME_KEY, MAX_HISTORY } from '../constants.js';
import { $ } from '../utils.js';
import * as state from '../state.js';
import { peekUndo } from '../state.js';
import { panToItem } from '../viewport.js';
import eventBus, { Events } from '../events-bus.js';

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
    const themeToggle = $('themeToggle');
    if (themeToggle) {
        const moon = themeToggle.querySelector('.moon');
        const sun = themeToggle.querySelector('.sun');
        if (moon) moon.style.display = isLight ? 'none' : 'block';
        if (sun) sun.style.display = isLight ? 'block' : 'none';
    }
}

// ============ Search ============

const searchBar = $('searchBar');
const searchInput = $('searchInput');

export function toggleSearch() {
    if (searchBar?.classList.contains('active')) {
        closeSearch();
    } else {
        openSearch();
    }
}

export function openSearch() {
    searchBar?.classList.add('active');
    $('searchBtn')?.classList.add('active');
    searchInput?.focus();
}

export function closeSearch() {
    searchBar?.classList.remove('active');
    $('searchBtn')?.classList.remove('active');
    if (searchInput) searchInput.value = '';
    clearSearchHighlights();
    state.setSearchResults([]);
    updateSearchCount();
}

function clearSearchHighlights() {
    state.items.forEach(i => i.el.classList.remove('search-highlight'));
}

function doSearch() {
    const q = searchInput?.value.toLowerCase().trim() || '';
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
        else if (item.type === 'keyword') text = (item.content || '').toLowerCase();
        else if (item.type === 'link') text = (item.content.title + ' ' + item.content.url).toLowerCase();
        if (text.includes(q)) results.push(item);
    });

    state.setSearchResults(results);
    state.setSearchIndex(results.length ? 0 : -1);
    updateSearchCount();
    highlightCurrentResult();
}

function updateSearchCount() {
    const countEl = $('searchCount');
    if (countEl) {
        countEl.textContent = state.searchResults.length
            ? `${state.searchIndex + 1}/${state.searchResults.length}`
            : '0/0';
    }
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
    searchInput?.addEventListener('input', doSearch);

    $('searchPrev')?.addEventListener('click', () => {
        if (state.searchResults.length) {
            state.setSearchIndex((state.searchIndex - 1 + state.searchResults.length) % state.searchResults.length);
            updateSearchCount();
            highlightCurrentResult();
        }
    });

    $('searchNext')?.addEventListener('click', () => {
        if (state.searchResults.length) {
            state.setSearchIndex((state.searchIndex + 1) % state.searchResults.length);
            updateSearchCount();
            highlightCurrentResult();
        }
    });

    $('searchClose')?.addEventListener('click', closeSearch);
}

// ============ Undo/Redo State Operations ============

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
            dir: c.dir,
            label: c.label || ''
        }))
    };

    // Prevent duplicate states
    const lastState = peekUndo();
    if (lastState) {
        const lastStr = JSON.stringify(lastState);
        const currentStr = JSON.stringify(stateData);
        if (lastStr === currentStr) return;
    }

    state.pushUndo(stateData);
    if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
    state.clearRedo();
    updateUndoRedoButtons();
}

export function updateUndoRedoButtons() {
    const undoBtn = $('undoBtn');
    const redoBtn = $('redoBtn');
    if (undoBtn) {
        undoBtn.disabled = state.undoStack.length < 2;
        undoBtn.classList.toggle('disabled', state.undoStack.length < 2);
    }
    if (redoBtn) {
        redoBtn.disabled = state.redoStack.length === 0;
        redoBtn.classList.toggle('disabled', state.redoStack.length === 0);
    }
}

// ============ Z-Index Normalization ============
// Prevents z-index overflow by periodically renumbering

const Z_INDEX_THRESHOLD = 10000;
const Z_INDEX_STEP = 10;

export function normalizeZIndices() {
    if (state.highestZ < Z_INDEX_THRESHOLD) return;

    // Sort items by current z-index
    const sortedItems = [...state.items].sort((a, b) => {
        const zA = parseInt(a.el.style.zIndex) || 0;
        const zB = parseInt(b.el.style.zIndex) || 0;
        return zA - zB;
    });

    // Reassign z-indices with gaps for future insertions
    let newZ = Z_INDEX_STEP;
    sortedItems.forEach(item => {
        if (!item.locked) {
            item.el.style.zIndex = newZ;
            newZ += Z_INDEX_STEP;
        } else {
            item.el.style.zIndex = 1; // Locked items stay at bottom
        }
    });

    state.setHighestZ(newZ);
}

// ============ Auto Save ============

let hasPendingChanges = false;

// Callback to be set by canvas module
let saveCurrentCanvasFn = null;

export function setSaveCurrentCanvasFn(fn) {
    saveCurrentCanvasFn = fn;
}

export function triggerAutoSave() {
    hasPendingChanges = true;
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    state.setAutoSaveTimer(setTimeout(() => {
        if (saveCurrentCanvasFn) saveCurrentCanvasFn();
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
                dir: c.dir,
                label: c.label || ''
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

// Save on page unload
window.addEventListener('beforeunload', () => {
    if (hasPendingChanges && state.currentCanvasId) {
        saveToLocalStorageSync();
    }
});

// Save on visibility change
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasPendingChanges && state.currentCanvasId) {
        saveToLocalStorageSync();
        hasPendingChanges = false;
    }
});

// ============ Sidebar Helpers ============

const sidebar = $('sidebar');

export function closeSidebarIfUnpinned() {
    if (!state.sidebarPinned && sidebar?.classList.contains('open')) {
        sidebar.classList.remove('open');
        state.setSidebarOpen(false);
    }
}

// ============ Event Bus Subscriptions ============

// Subscribe to state save events
eventBus.on(Events.STATE_SAVE, saveState);
eventBus.on(Events.AUTOSAVE_TRIGGER, triggerAutoSave);
