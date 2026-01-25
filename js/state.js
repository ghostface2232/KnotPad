// KnotPad - Global State Management (Proxy-based Reactive State)

import eventBus, { Events } from './events-bus.js';

// Grid size constant (non-reactive)
export const GRID_SIZE = 16;

// Blob URL cache (non-reactive, managed separately)
export const blobURLCache = new Map();

// Properties that should sync to localStorage
const localStorageProps = {
    sidebarPinned: 'knotpad-sidebar-pinned',
    sidebarOpen: 'knotpad-sidebar-open',
    defaultFontSize: 'knotpad-default-font-size',
    noteWrapMode: 'knotpad-note-wrap-mode',
    defaultTextAlign: 'knotpad-default-text-align',
    invertWheelZoom: 'knotpad-invert-wheel-zoom',
    gridSnap: 'knotpad-grid-snap',
    colorDisplayMode: 'knotpad-color-display-mode',
    linkPreviewEnabled: 'knotpad-link-preview-enabled'
};

// Properties that are boolean in localStorage
const booleanProps = new Set(['sidebarPinned', 'sidebarOpen', 'invertWheelZoom', 'gridSnap', 'linkPreviewEnabled']);

// Properties that should not trigger state:changed events (internal/transient)
const silentProps = new Set([
    'isPanning', 'startX', 'startY', 'isSpacePressed', 'isSpacePanning',
    'isSelecting', 'selStartX', 'selStartY', 'isSelectingText',
    'draggedItem', 'resizingItem', 'connectSource', 'connectHandle', 'tempLine',
    'autoSaveTimer', 'minimapThrottle', 'zoomAnimationFrame',
    'iconPickerTarget', 'childPickerData', 'newNodePickerData'
]);

/**
 * Create a reactive state object wrapped in a Proxy
 */
function createState(initialState) {
    const handler = {
        set(target, property, value) {
            const oldValue = target[property];

            // Skip if value is the same (for primitives)
            if (oldValue === value && typeof value !== 'object') {
                return true;
            }

            // Set the value
            target[property] = value;

            // Sync to localStorage if needed
            if (property in localStorageProps) {
                const storageKey = localStorageProps[property];
                if (booleanProps.has(property)) {
                    localStorage.setItem(storageKey, value);
                } else {
                    localStorage.setItem(storageKey, value);
                }
            }

            // Emit state change event for non-silent properties
            if (!silentProps.has(property)) {
                eventBus.emit(Events.STATE_CHANGED, {
                    key: property,
                    oldValue,
                    newValue: value
                });
            }

            return true;
        },

        get(target, property) {
            return target[property];
        }
    };

    return new Proxy(initialState, handler);
}

// Initial state values
const initialState = {
    // Viewport state
    scale: 1,
    offsetX: 0,
    offsetY: 0,

    // Pan/Drag state
    isPanning: false,
    startX: 0,
    startY: 0,
    isSpacePressed: false,
    isSpacePanning: false,

    // Selection state
    isSelecting: false,
    selStartX: 0,
    selStartY: 0,
    isSelectingText: false,

    // Items and connections
    items: [],
    connections: [],
    selectedItems: new Set(),
    selectedItem: null,
    selectedConn: null,

    // Z-index and ID tracking
    highestZ: 1,
    itemId: 0,

    // Drag/Resize state
    draggedItem: null,
    resizingItem: null,

    // Connection drawing state
    connectSource: null,
    connectHandle: null,
    tempLine: null,

    // Filter state
    activeFilter: 'all',

    // Color group mode state
    colorGroupModeActive: false,
    originalPositions: new Map(), // Stores original positions before color grouping

    // Auto-save timer
    autoSaveTimer: null,

    // Canvas management
    canvases: [],
    currentCanvasId: null,

    // Canvas groups
    canvasGroups: [],
    collapsedGroups: new Set(),

    // Minimap throttle
    minimapThrottle: null,

    // Sidebar state (loaded from localStorage)
    sidebarPinned: localStorage.getItem('knotpad-sidebar-pinned') === 'true',
    sidebarOpen: localStorage.getItem('knotpad-sidebar-open') === 'true',

    // Picker state
    iconPickerTarget: null,
    childPickerData: null,
    newNodePickerData: null,

    // Undo/Redo stacks (now stores structured objects, not JSON strings)
    undoStack: [],
    redoStack: [],

    // Search state
    searchResults: [],
    searchIndex: -1,

    // Zoom animation frame
    zoomAnimationFrame: null,

    // Settings (loaded from localStorage)
    defaultFontSize: localStorage.getItem('knotpad-default-font-size') || 'small',
    noteWrapMode: localStorage.getItem('knotpad-note-wrap-mode') || 'word',
    defaultTextAlign: localStorage.getItem('knotpad-default-text-align') || 'left',
    invertWheelZoom: localStorage.getItem('knotpad-invert-wheel-zoom') === 'true',
    gridSnap: localStorage.getItem('knotpad-grid-snap') === 'true',
    colorDisplayMode: localStorage.getItem('knotpad-color-display-mode') || 'bar',
    linkPreviewEnabled: localStorage.getItem('knotpad-link-preview-enabled') === 'true'
};

// Create the reactive state
export const state = createState(initialState);

// ============ Convenience Accessors (for backward compatibility) ============
// These allow `import { scale } from './state.js'` to still work during migration

export const getScale = () => state.scale;
export const getOffsetX = () => state.offsetX;
export const getOffsetY = () => state.offsetY;

// ============ Helper Functions ============

/**
 * Increment and return the new highest Z-index
 */
export function incrementHighestZ() {
    return ++state.highestZ;
}

/**
 * Increment and return the new item ID
 */
export function incrementItemId() {
    return ++state.itemId;
}

/**
 * Toggle a group's collapsed state
 */
export function toggleGroupCollapsed(groupId) {
    if (state.collapsedGroups.has(groupId)) {
        state.collapsedGroups.delete(groupId);
    } else {
        state.collapsedGroups.add(groupId);
    }
    // Manually emit change since Set mutation doesn't trigger proxy
    eventBus.emit(Events.STATE_CHANGED, {
        key: 'collapsedGroups',
        oldValue: state.collapsedGroups,
        newValue: state.collapsedGroups
    });
}

/**
 * Reset viewport state to defaults
 */
export function resetViewport() {
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    state.itemId = 1;
    state.highestZ = 1;
}

/**
 * Clear all items and connections
 */
export function clearItemsAndConnections() {
    blobURLCache.forEach(url => URL.revokeObjectURL(url));
    blobURLCache.clear();
    state.connections.forEach(c => { c.el.remove(); if (c.hitArea) c.hitArea.remove(); if (c.arrow) c.arrow.remove(); if (c.labelEl) c.labelEl.remove(); });
    state.connections = [];
    state.items.forEach(i => i.el.remove());
    state.items = [];
    state.selectedItems.clear();
    setSelectedItem(null);
    state.selectedConn = null;
    state.undoStack = [];
    state.redoStack = [];
}

// ============ Undo/Redo Stack Operations ============
// Now works with structured objects instead of JSON strings

/**
 * Push a state snapshot to the undo stack
 * @param {Object} stateSnapshot - Structured state object (not JSON string)
 */
export function pushUndo(stateSnapshot) {
    state.undoStack.push(stateSnapshot);
}

/**
 * Pop the last state from undo stack
 * @returns {Object|undefined} The last state snapshot
 */
export function popUndo() {
    return state.undoStack.pop();
}

/**
 * Push a state snapshot to the redo stack
 * @param {Object} stateSnapshot - Structured state object
 */
export function pushRedo(stateSnapshot) {
    state.redoStack.push(stateSnapshot);
}

/**
 * Pop the last state from redo stack
 * @returns {Object|undefined} The last state snapshot
 */
export function popRedo() {
    return state.redoStack.pop();
}

/**
 * Clear the redo stack
 */
export function clearRedo() {
    state.redoStack = [];
}

/**
 * Get the last undo state without removing it
 * @returns {Object|undefined} The last state snapshot
 */
export function peekUndo() {
    return state.undoStack.length > 0 ? state.undoStack[state.undoStack.length - 1] : undefined;
}

// ============ Legacy Direct Exports (for backward compatibility) ============
// These exported variables are kept in sync with the reactive state
// so that `import * as state from './state.js'` continues to work

export let scale = state.scale;
export let offsetX = state.offsetX;
export let offsetY = state.offsetY;
export let isPanning = state.isPanning;
export let startX = state.startX;
export let startY = state.startY;
export let isSpacePressed = state.isSpacePressed;
export let isSpacePanning = state.isSpacePanning;
export let isSelecting = state.isSelecting;
export let selStartX = state.selStartX;
export let selStartY = state.selStartY;
export let isSelectingText = state.isSelectingText;
export let items = state.items;
export let connections = state.connections;
export let selectedItems = state.selectedItems;
export let selectedItem = state.selectedItem;
export let selectedConn = state.selectedConn;
export let highestZ = state.highestZ;
export let itemId = state.itemId;
export let draggedItem = state.draggedItem;
export let resizingItem = state.resizingItem;
export let connectSource = state.connectSource;
export let connectHandle = state.connectHandle;
export let tempLine = state.tempLine;
export let activeFilter = state.activeFilter;
export let autoSaveTimer = state.autoSaveTimer;
export let canvases = state.canvases;
export let currentCanvasId = state.currentCanvasId;
export let canvasGroups = state.canvasGroups;
export let collapsedGroups = state.collapsedGroups;
export let minimapThrottle = state.minimapThrottle;
export let sidebarPinned = state.sidebarPinned;
export let sidebarOpen = state.sidebarOpen;
export let iconPickerTarget = state.iconPickerTarget;
export let childPickerData = state.childPickerData;
export let newNodePickerData = state.newNodePickerData;
export let undoStack = state.undoStack;
export let redoStack = state.redoStack;
export let searchResults = state.searchResults;
export let searchIndex = state.searchIndex;
export let zoomAnimationFrame = state.zoomAnimationFrame;
export let defaultFontSize = state.defaultFontSize;
export let noteWrapMode = state.noteWrapMode;
export let defaultTextAlign = state.defaultTextAlign;
export let invertWheelZoom = state.invertWheelZoom;
export let gridSnap = state.gridSnap;
export let colorDisplayMode = state.colorDisplayMode;
export let linkPreviewEnabled = state.linkPreviewEnabled;
export let colorGroupModeActive = state.colorGroupModeActive;
export let originalPositions = state.originalPositions;

// ============ Legacy Setter Functions (for backward compatibility) ============
// These update both the reactive state AND the exported primitives to maintain
// backward compatibility with `import * as state` pattern

export function setScale(val) { state.scale = val; scale = val; }
export function setOffsetX(val) { state.offsetX = val; offsetX = val; }
export function setOffsetY(val) { state.offsetY = val; offsetY = val; }
export function setIsPanning(val) { state.isPanning = val; isPanning = val; }
export function setStartX(val) { state.startX = val; startX = val; }
export function setStartY(val) { state.startY = val; startY = val; }
export function setIsSpacePressed(val) { state.isSpacePressed = val; isSpacePressed = val; }
export function setIsSpacePanning(val) { state.isSpacePanning = val; isSpacePanning = val; }
export function setIsSelecting(val) { state.isSelecting = val; isSelecting = val; }
export function setSelStartX(val) { state.selStartX = val; selStartX = val; }
export function setSelStartY(val) { state.selStartY = val; selStartY = val; }
export function setIsSelectingText(val) { state.isSelectingText = val; isSelectingText = val; }
export function setSelectedItem(val) { state.selectedItem = val; selectedItem = val; }
export function setSelectedConn(val) { state.selectedConn = val; selectedConn = val; }
export function setHighestZ(val) { state.highestZ = val; highestZ = val; }
export function setItemId(val) { state.itemId = val; itemId = val; }
export function setDraggedItem(val) { state.draggedItem = val; draggedItem = val; }
export function setResizingItem(val) { state.resizingItem = val; resizingItem = val; }
export function setConnectSource(val) { state.connectSource = val; connectSource = val; }
export function setConnectHandle(val) { state.connectHandle = val; connectHandle = val; }
export function setTempLine(val) { state.tempLine = val; tempLine = val; }
export function setActiveFilter(val) { state.activeFilter = val; activeFilter = val; }
export function setColorGroupModeActive(val) { state.colorGroupModeActive = val; colorGroupModeActive = val; }
export function setOriginalPositions(val) { state.originalPositions = val; originalPositions = val; }
export function setAutoSaveTimer(val) { state.autoSaveTimer = val; autoSaveTimer = val; }
export function setCanvases(val) { state.canvases = val; canvases = val; }
export function setCurrentCanvasId(val) { state.currentCanvasId = val; currentCanvasId = val; }
export function setCanvasGroups(val) { state.canvasGroups = val; canvasGroups = val; }
export function setMinimapThrottle(val) { state.minimapThrottle = val; minimapThrottle = val; }
export function setSidebarPinned(val) { state.sidebarPinned = val; sidebarPinned = val; }
export function setSidebarOpen(val) { state.sidebarOpen = val; sidebarOpen = val; }
export function setIconPickerTarget(val) { state.iconPickerTarget = val; iconPickerTarget = val; }
export function setChildPickerData(val) { state.childPickerData = val; childPickerData = val; }
export function setNewNodePickerData(val) { state.newNodePickerData = val; newNodePickerData = val; }
export function setUndoStack(val) { state.undoStack = val; undoStack = val; }
export function setRedoStack(val) { state.redoStack = val; redoStack = val; }
export function setSearchResults(val) { state.searchResults = val; searchResults = val; }
export function setSearchIndex(val) { state.searchIndex = val; searchIndex = val; }
export function setZoomAnimationFrame(val) { state.zoomAnimationFrame = val; zoomAnimationFrame = val; }
export function setDefaultFontSize(val) { state.defaultFontSize = val; defaultFontSize = val; }
export function setNoteWrapMode(val) { state.noteWrapMode = val; noteWrapMode = val; }
export function setDefaultTextAlign(val) { state.defaultTextAlign = val; defaultTextAlign = val; }
export function setInvertWheelZoom(val) { state.invertWheelZoom = val; invertWheelZoom = val; }
export function setGridSnap(val) { state.gridSnap = val; gridSnap = val; }
export function setColorDisplayMode(val) { state.colorDisplayMode = val; colorDisplayMode = val; }
export function setLinkPreviewEnabled(val) { state.linkPreviewEnabled = val; linkPreviewEnabled = val; }
