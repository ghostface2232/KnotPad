// KnotPad - Events Module (Mouse, Keyboard, Drag & Drop)

import { $ } from './utils.js';
import * as state from './state.js';
import { updateTransform, setZoom, throttledMinimap, startPan } from './viewport.js';
import { selectItem, deselectAll, deleteSelectedItems, addMemo, addLink, toggleHeading } from './items.js';
import { updateAllConnections, cancelConnection, deleteConnection, updateTempLine, completeConnectionWithNewMemo, deselectConnection } from './connections.js';
import {
    undo, redo, toggleSearch, openSearch, closeSearch, closeLinkModal,
    closeSidebarIfUnpinned, showNewNodePicker, triggerAutoSave, saveState, handleFile,
    saveCurrentCanvas, showCanvasContextMenu, closeSettingsModal, copyItemToClipboard
} from './ui.js';

const app = $('app');
const canvas = $('canvas');
const selectionBox = $('selectionBox');
const dropZone = $('dropZone');
const fileInput = $('fileInput');

let mouseEventsController;
let keyboardEventsController;
let dragDropEventsController;
let copyEventsController;
let pasteEventsController;
let globalContextMenuController;
let documentClickController;

// ============ Mouse Events ============

export function setupMouseEvents() {
    if (mouseEventsController) mouseEventsController.abort();
    mouseEventsController = new AbortController();
    const { signal } = mouseEventsController;

    // Wheel - zoom canvas or scroll memo content
    app.addEventListener('wheel', e => {
        // Check if cursor is over a scrollable memo-body (including child elements)
        const memoBody = e.target.closest('.memo-body');
        if (memoBody) {
            const hasScrollableContent = memoBody.scrollHeight > memoBody.clientHeight;
            if (hasScrollableContent) {
                // Check if we're at scroll boundaries
                const atTop = memoBody.scrollTop <= 0;
                const atBottom = memoBody.scrollTop + memoBody.clientHeight >= memoBody.scrollHeight - 1;
                const scrollingUp = e.deltaY < 0;
                const scrollingDown = e.deltaY > 0;

                // Allow native scroll if not at boundary, or at boundary but scrolling into content
                if ((!atTop && !atBottom) || (atTop && scrollingDown) || (atBottom && scrollingUp)) {
                    // Let the memo scroll naturally, don't zoom
                    return;
                }
                // At boundary and trying to scroll past it - still prevent zoom to avoid jarring UX
                e.preventDefault();
                return;
            }
            // No scrollable content - fall through to zoom
        }

        e.preventDefault();
        // Apply invert wheel zoom setting
        let d = e.deltaY > 0 ? 0.9 : 1.1;
        if (state.invertWheelZoom) d = 1 / d;
        const rect = app.getBoundingClientRect();
        setZoom(state.scale * d, e.clientX - rect.left, e.clientY - rect.top, false);
    }, { passive: false, signal });

    // Mouse down
    app.addEventListener('mousedown', e => {
        app.focus();
        closeSidebarIfUnpinned();

        if (e.button === 1) {
            e.preventDefault();
            startPan(e.clientX, e.clientY);
            return;
        }

        // Space + left click for panning
        if (e.button === 0 && state.isSpacePressed) {
            e.preventDefault();
            state.setIsSpacePanning(true);
            startPan(e.clientX, e.clientY);
            return;
        }

        if (e.button === 0 && (e.target === canvas || e.target.classList.contains('grid-overlay') || e.target === app)) {
            // Don't start box selection if text is being selected in a memo
            if (state.isSelectingText) return;
            // Don't start box selection if in connecting mode (wait for click/dblclick)
            if (state.connectSource) return;
            if (!e.shiftKey) deselectAll();
            state.setIsSelecting(true);
            state.setSelStartX(e.clientX);
            state.setSelStartY(e.clientY);
            selectionBox.style.display = 'block';
            selectionBox.style.left = e.clientX + 'px';
            selectionBox.style.top = e.clientY + 'px';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
        }
    }, { signal });

    // Double-click to create new node
    app.addEventListener('dblclick', e => {
        if (e.target === canvas || e.target.classList.contains('grid-overlay') || e.target === app) {
            const rect = app.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left - state.offsetX) / state.scale - 100;
            const canvasY = (e.clientY - rect.top - state.offsetY) / state.scale - 70;

            // If in connecting mode, create a new memo and complete connection
            if (state.connectSource) {
                completeConnectionWithNewMemo(canvasX, canvasY);
                return;
            }

            showNewNodePicker(e.clientX, e.clientY, canvasX, canvasY);
        }
    }, { signal });

    // Right-click on canvas to show context menu (or cancel connection in connecting mode)
    app.addEventListener('contextmenu', e => {
        if (e.target === canvas || e.target.classList.contains('grid-overlay') || e.target === app) {
            e.preventDefault();

            // In connecting mode, right-click cancels the connection immediately
            if (state.connectSource) {
                cancelConnection(true); // with fade effect
                return;
            }

            const rect = app.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left - state.offsetX) / state.scale - 90;
            const canvasY = (e.clientY - rect.top - state.offsetY) / state.scale - 60;
            showCanvasContextMenu(e.clientX, e.clientY, canvasX, canvasY);
        }
    }, { signal });


    // Mouse move
    window.addEventListener('mousemove', e => {
        if (state.isPanning) {
            state.setOffsetX(e.clientX - state.startX);
            state.setOffsetY(e.clientY - state.startY);
            updateTransform();
            throttledMinimap();
            return;
        }

        if (state.isSelecting && !state.isSelectingText) {
            const minX = Math.min(state.selStartX, e.clientX);
            const maxX = Math.max(state.selStartX, e.clientX);
            const minY = Math.min(state.selStartY, e.clientY);
            const maxY = Math.max(state.selStartY, e.clientY);
            selectionBox.style.left = minX + 'px';
            selectionBox.style.top = minY + 'px';
            selectionBox.style.width = (maxX - minX) + 'px';
            selectionBox.style.height = (maxY - minY) + 'px';
            return;
        }

        if (state.draggedItem) {
            const rect = app.getBoundingClientRect();
            const curX = (e.clientX - rect.left - state.offsetX) / state.scale;
            const curY = (e.clientY - rect.top - state.offsetY) / state.scale;
            let newX = curX - state.draggedItem.ox;
            let newY = curY - state.draggedItem.oy;

            // Apply grid snap if enabled
            if (state.gridSnap) {
                newX = Math.round(newX / state.GRID_SIZE) * state.GRID_SIZE;
                newY = Math.round(newY / state.GRID_SIZE) * state.GRID_SIZE;
            }

            const dx = newX - state.draggedItem.x;
            const dy = newY - state.draggedItem.y;

            state.selectedItems.forEach(item => {
                item.x += dx;
                item.y += dy;
                item.el.style.left = item.x + 'px';
                item.el.style.top = item.y + 'px';
            });
            updateAllConnections();
            throttledMinimap();
        }

        if (state.resizingItem) {
            const rect = app.getBoundingClientRect();
            let x = (e.clientX - rect.left - state.offsetX) / state.scale;
            let y = (e.clientY - rect.top - state.offsetY) / state.scale;

            // Apply grid snap to the bottom-right corner if enabled
            if (state.gridSnap) {
                x = Math.round(x / state.GRID_SIZE) * state.GRID_SIZE;
                y = Math.round(y / state.GRID_SIZE) * state.GRID_SIZE;
            }

            let newW = Math.max(140, x - state.resizingItem.x);
            let newH = Math.max(80, y - state.resizingItem.y);

            // Keyword node: horizontal resize only, fixed height
            if (state.resizingItem.type === 'keyword') {
                newW = Math.max(100, x - state.resizingItem.x);
                newH = 56; // Fixed height for pill shape
            }
            // Shift key: maintain aspect ratio (proportional resize) - not for keyword nodes
            else if (e.shiftKey && state.resizingItem.initialAspectRatio) {
                const aspectRatio = state.resizingItem.initialAspectRatio;
                // Calculate height based on width to maintain ratio
                const hFromW = newW / aspectRatio;
                // Calculate width based on height to maintain ratio
                const wFromH = newH * aspectRatio;

                // Choose the dimension that fits within the drag bounds
                if (hFromW <= newH) {
                    newH = Math.max(80, hFromW);
                } else {
                    newW = Math.max(140, wFromH);
                }
            }

            state.resizingItem.w = newW;
            state.resizingItem.h = newH;
            state.resizingItem.el.style.width = state.resizingItem.w + 'px';
            state.resizingItem.el.style.height = state.resizingItem.h + 'px';
            updateAllConnections();
            throttledMinimap();
        }

        if (state.tempLine) {
            const rect = app.getBoundingClientRect();
            updateTempLine(
                (e.clientX - rect.left - state.offsetX) / state.scale + 10000,
                (e.clientY - rect.top - state.offsetY) / state.scale + 10000
            );
        }
    }, { signal });

    // Mouse up
    window.addEventListener('mouseup', e => {
        if (state.isPanning) {
            state.setIsPanning(false);
            if (!state.isSpacePressed) app.classList.remove('panning');
            state.setIsSpacePanning(false);
        }

        if (state.isSelecting) {
            state.setIsSelecting(false);
            const sb = selectionBox.getBoundingClientRect();
            selectionBox.style.display = 'none';

            if (sb.width > 2 && sb.height > 2) {
                const rect = app.getBoundingClientRect();
                const bx = (sb.left - rect.left - state.offsetX) / state.scale;
                const by = (sb.top - rect.top - state.offsetY) / state.scale;
                const bw = sb.width / state.scale;
                const bh = sb.height / state.scale;

                state.items.forEach(item => {
                    if (item.x < bx + bw && item.x + item.w > bx && item.y < by + bh && item.y + item.h > by) {
                        selectItem(item, true);
                    }
                });
            }
        }

        if (state.draggedItem || state.resizingItem) {
            if (state.draggedItem) {
                state.selectedItems.forEach(i => i.el.classList.remove('dragging'));
                canvas.classList.remove('dragging-item');
                document.body.classList.remove('is-dragging');
                saveState();
                state.setDraggedItem(null);
            }
            if (state.resizingItem) {
                document.body.classList.remove('is-dragging');
                saveState();
                state.setResizingItem(null);
            }
            triggerAutoSave();
        }
    }, { signal });
}

// ============ Keyboard Events ============

export function setupKeyboardEvents() {
    if (keyboardEventsController) keyboardEventsController.abort();
    keyboardEventsController = new AbortController();
    const { signal } = keyboardEventsController;

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            openSearch();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
            e.preventDefault();
            redo();
            return;
        }
        // Ctrl+D for strikethrough in contenteditable
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            if (e.target.matches('[contenteditable="true"]') || e.target.closest('[contenteditable="true"]')) {
                e.preventDefault();
                document.execCommand('strikeThrough', false, null);
                return;
            }
        }
        // Ctrl+I for italic in contenteditable
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            if (e.target.matches('[contenteditable="true"]') || e.target.closest('[contenteditable="true"]')) {
                e.preventDefault();
                document.execCommand('italic', false, null);
                return;
            }
        }
        // Ctrl+H for heading toggle in contenteditable
        if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
            const editableEl = e.target.matches('[contenteditable="true"]') ? e.target : e.target.closest('[contenteditable="true"]');
            if (editableEl) {
                e.preventDefault();
                toggleHeading(editableEl);
                return;
            }
        }
        if (e.key === 'Escape') {
            cancelConnection(true); // with fade effect
            closeLinkModal();
            closeSearch();
            closeSettingsModal();
            deselectAll();
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches('input,textarea,[contenteditable="true"]')) {
            if (state.selectedItems.size > 0) deleteSelectedItems();
            else if (state.selectedConn) deleteConnection(state.selectedConn);
        }
        // Space for pan mode
        if (e.code === 'Space' && !e.target.matches('input,textarea,[contenteditable="true"]') && !state.isSpacePressed) {
            e.preventDefault();
            state.setIsSpacePressed(true);
            app.classList.add('space-pan-mode');
        }
    }, { signal });

    document.addEventListener('keyup', e => {
        if (e.code === 'Space' && state.isSpacePressed) {
            state.setIsSpacePressed(false);
            state.setIsSpacePanning(false);
            app.classList.remove('space-pan-mode');
            app.classList.remove('panning');
        }
    }, { signal });
}

// ============ Drag & Drop Events ============

export function setupDragDropEvents() {
    if (dragDropEventsController) dragDropEventsController.abort();
    dragDropEventsController = new AbortController();
    const { signal } = dragDropEventsController;

    window.addEventListener('dragenter', e => {
        e.preventDefault();
        dropZone.classList.add('active');
    }, { signal });

    window.addEventListener('dragleave', e => {
        e.preventDefault();
        dropZone.classList.remove('active');
    }, { signal });

    window.addEventListener('dragover', e => e.preventDefault(), { signal });

    window.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('active');
        const rect = app.getBoundingClientRect();
        const x = (e.clientX - rect.left - state.offsetX) / state.scale - 100;
        const y = (e.clientY - rect.top - state.offsetY) / state.scale - 70;

        if (e.dataTransfer.files.length) {
            [...e.dataTransfer.files].forEach((f, i) => handleFile(f, x + i * 24, y + i * 24));
        } else {
            const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
            if (url?.startsWith('http')) {
                addLink(url, '', x, y);
                saveState();
                triggerAutoSave();
            }
        }
    }, { signal });
}

// ============ Copy Events ============

export function setupCopyEvents() {
    if (copyEventsController) copyEventsController.abort();
    copyEventsController = new AbortController();
    const { signal } = copyEventsController;

    window.addEventListener('copy', e => {
        // Check if there are selected link/image items and not editing text
        const isEditing = e.target.matches('[contenteditable="true"]') || e.target.closest('[contenteditable="true"]');

        if (!isEditing && state.selectedItems.size > 0) {
            // Get first selected item that is link or image
            const copyableItem = [...state.selectedItems].find(item =>
                item.type === 'link' || item.type === 'image'
            );

            if (copyableItem) {
                e.preventDefault();
                copyItemToClipboard(copyableItem);
                return;
            }
        }

        // Original contenteditable copy behavior
        if (!isEditing) return;

        const sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) return;

        // Get plain text from selection
        const plainText = sel.toString();
        if (!plainText) return;

        e.preventDefault();
        e.clipboardData.setData('text/plain', plainText);
    }, { signal });
}

// ============ Paste Events ============

export function setupPasteEvents() {
    if (pasteEventsController) pasteEventsController.abort();
    pasteEventsController = new AbortController();
    const { signal } = pasteEventsController;

    window.addEventListener('paste', e => {
        // Allow default paste behavior in input, textarea, and contenteditable elements
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.target.matches('[contenteditable="true"]') || e.target.closest('[contenteditable="true"]')) return;

        // Also check document.activeElement for cases where focus is in contenteditable but e.target differs
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
        if (activeEl && (activeEl.matches('[contenteditable="true"]') || activeEl.closest('[contenteditable="true"]'))) return;

        e.preventDefault();
        const cd = e.clipboardData;
        if (!cd) return;

        const x = (innerWidth / 2 - state.offsetX) / state.scale - 100;
        const y = (innerHeight / 2 - state.offsetY) / state.scale - 100;

        for (let i = 0; i < cd.items.length; i++) {
            const item = cd.items[i];
            if (item.type.indexOf('image') !== -1) {
                handleFile(item.getAsFile(), x + i * 20, y + i * 20);
            } else if (item.kind === 'string' && item.type.indexOf('text/plain') !== -1) {
                item.getAsString(text => {
                    text = text.trim();
                    if (!text) return;
                    if (/^https?:\/\/[^ "]+$/.test(text)) {
                        addLink(text, '', x, y);
                    } else {
                        addMemo(text, x, y);
                    }
                    saveState();
                    triggerAutoSave();
                });
            }
        }
    }, { signal });
}

// ============ Global Context Menu Block ============

export function setupGlobalContextMenuBlock() {
    if (globalContextMenuController) globalContextMenuController.abort();
    globalContextMenuController = new AbortController();
    const { signal } = globalContextMenuController;

    // Block browser's default context menu globally
    // Custom context menus (items, connections, sidebar) use stopPropagation(),
    // so they won't bubble up here and will work normally
    document.addEventListener('contextmenu', e => {
        e.preventDefault();
    }, { signal });
}

// ============ Document Click Handler ============

export function setupDocumentClickHandler() {
    if (documentClickController) documentClickController.abort();
    documentClickController = new AbortController();
    const { signal } = documentClickController;

    document.addEventListener('click', e => {
        if (!e.target.closest('.color-picker') && !e.target.closest('.color-btn')) {
            document.querySelectorAll('.color-picker.active').forEach(p => p.classList.remove('active'));
        }
        if (!e.target.closest('#filterBtn') && !e.target.closest('#filterDropdown')) {
            $('filterDropdown').classList.remove('active');
        }
        if (!e.target.closest('#colorBtn') && !e.target.closest('#colorDropdown')) {
            $('colorDropdown').classList.remove('active');
        }
        if (!e.target.closest('.context-menu')) {
            $('contextMenu').classList.remove('active');
            $('connectionContextMenu').classList.remove('active');
            $('canvasContextMenu').classList.remove('active');
        }
        if (!e.target.closest('.conn-direction-picker') && !e.target.closest('.connection-line') && !e.target.closest('.conn-label-modal')) {
            $('connDirectionPicker').classList.remove('active');
            deselectConnection();
        }
        if (!e.target.closest('.canvas-icon-picker') && !e.target.closest('.canvas-icon')) {
            $('canvasIconPicker').classList.remove('active');
            state.setIconPickerTarget(null);
        }
    }, { signal });
}
