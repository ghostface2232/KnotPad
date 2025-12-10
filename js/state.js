// KnotPad - Global State Management

// Viewport state
export let scale = 1;
export let offsetX = 0;
export let offsetY = 0;

// Pan/Drag state
export let isPanning = false;
export let startX = 0;
export let startY = 0;
export let isSpacePressed = false;
export let isSpacePanning = false;

// Selection state
export let isSelecting = false;
export let selStartX = 0;
export let selStartY = 0;

// Items and connections
export let items = [];
export let connections = [];
export let selectedItems = new Set();
export let selectedConn = null;

// Z-index and ID tracking
export let highestZ = 1;
export let itemId = 0;

// Drag/Resize state
export let draggedItem = null;
export let resizingItem = null;

// Connection drawing state
export let connectSource = null;
export let connectHandle = null;
export let tempLine = null;

// Filter state
export let activeFilter = 'all';

// Auto-save timer
export let autoSaveTimer = null;

// Canvas management
export let canvases = [];
export let currentCanvasId = null;

// Minimap throttle
export let minimapThrottle = null;

// Sidebar state
export let sidebarPinned = localStorage.getItem('knotpad-sidebar-pinned') === 'true';

// Picker state
export let iconPickerTarget = null;
export let childPickerData = null;
export let newNodePickerData = null;

// Undo/Redo stacks
export let undoStack = [];
export let redoStack = [];

// Search state
export let searchResults = [];
export let searchIndex = -1;

// Zoom animation frame
export let zoomAnimationFrame = null;

// Blob URL cache
export const blobURLCache = new Map();

// Settings
export let defaultFontSize = localStorage.getItem('knotpad-default-font-size') || 'small';
export let invertWheelZoom = localStorage.getItem('knotpad-invert-wheel-zoom') === 'true';

// Setters for state updates
export function setScale(val) { scale = val; }
export function setOffsetX(val) { offsetX = val; }
export function setOffsetY(val) { offsetY = val; }
export function setIsPanning(val) { isPanning = val; }
export function setStartX(val) { startX = val; }
export function setStartY(val) { startY = val; }
export function setIsSpacePressed(val) { isSpacePressed = val; }
export function setIsSpacePanning(val) { isSpacePanning = val; }
export function setIsSelecting(val) { isSelecting = val; }
export function setSelStartX(val) { selStartX = val; }
export function setSelStartY(val) { selStartY = val; }
export function setSelectedConn(val) { selectedConn = val; }
export function setHighestZ(val) { highestZ = val; }
export function incrementHighestZ() { return ++highestZ; }
export function setItemId(val) { itemId = val; }
export function incrementItemId() { return ++itemId; }
export function setDraggedItem(val) { draggedItem = val; }
export function setResizingItem(val) { resizingItem = val; }
export function setConnectSource(val) { connectSource = val; }
export function setConnectHandle(val) { connectHandle = val; }
export function setTempLine(val) { tempLine = val; }
export function setActiveFilter(val) { activeFilter = val; }
export function setAutoSaveTimer(val) { autoSaveTimer = val; }
export function setCanvases(val) { canvases = val; }
export function setCurrentCanvasId(val) { currentCanvasId = val; }
export function setMinimapThrottle(val) { minimapThrottle = val; }
export function setSidebarPinned(val) { sidebarPinned = val; localStorage.setItem('knotpad-sidebar-pinned', val); }
export function setIconPickerTarget(val) { iconPickerTarget = val; }
export function setChildPickerData(val) { childPickerData = val; }
export function setNewNodePickerData(val) { newNodePickerData = val; }
export function setUndoStack(val) { undoStack = val; }
export function setRedoStack(val) { redoStack = val; }
export function setSearchResults(val) { searchResults = val; }
export function setSearchIndex(val) { searchIndex = val; }
export function setZoomAnimationFrame(val) { zoomAnimationFrame = val; }
export function setDefaultFontSize(val) { defaultFontSize = val; localStorage.setItem('knotpad-default-font-size', val); }
export function setInvertWheelZoom(val) { invertWheelZoom = val; localStorage.setItem('knotpad-invert-wheel-zoom', val); }

// Reset viewport state
export function resetViewport() {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    itemId = 1;
    highestZ = 1;
}

// Clear all items and connections
export function clearItemsAndConnections() {
    blobURLCache.forEach(url => URL.revokeObjectURL(url));
    blobURLCache.clear();
    connections.forEach(c => { c.el.remove(); if (c.arrow) c.arrow.remove(); });
    connections = [];
    items.forEach(i => i.el.remove());
    items = [];
    selectedItems.clear();
    selectedConn = null;
    undoStack = [];
    redoStack = [];
}

// Push/Pop operations
export function pushUndo(state) { undoStack.push(state); }
export function popUndo() { return undoStack.pop(); }
export function pushRedo(state) { redoStack.push(state); }
export function popRedo() { return redoStack.pop(); }
export function clearRedo() { redoStack = []; }
