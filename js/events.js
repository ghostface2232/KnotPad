// KnotPad - Events Module (Mouse, Touch, Keyboard, Drag & Drop)

import { $ } from './utils.js';
import * as state from './state.js';
import { updateTransform, setZoom, throttledMinimap, startPan, updateMinimap } from './viewport.js';
import { selectItem, deselectAll, deleteSelectedItems, addMemo, addLink } from './items.js';
import { updateAllConnections, cancelConnection, deleteConnection, updateTempLine, completeConnectionWithNewMemo } from './connections.js';
import {
    undo, redo, toggleSearch, openSearch, closeSearch, closeLinkModal,
    closeSidebarIfUnpinned, showNewNodePicker, triggerAutoSave, saveState, handleFile,
    saveCurrentCanvas, showCanvasContextMenu
} from './ui.js';

const app = $('app');
const canvas = $('canvas');
const selectionBox = $('selectionBox');
const dropZone = $('dropZone');
const fileInput = $('fileInput');

// ============ Mouse Events ============

export function setupMouseEvents() {
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
    }, { passive: false });

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
    });

    // Double-click to create new node
    app.addEventListener('dblclick', e => {
        if (e.target === canvas || e.target.classList.contains('grid-overlay') || e.target === app) {
            const rect = app.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left - state.offsetX) / state.scale - 100;
            const canvasY = (e.clientY - rect.top - state.offsetY) / state.scale - 70;

            // If in connecting mode, create a new memo and complete connection
            if (state.connectSource) {
                // Clear any pending cancel timer
                if (state.connectCancelTimer) {
                    clearTimeout(state.connectCancelTimer);
                    state.setConnectCancelTimer(null);
                }
                completeConnectionWithNewMemo(canvasX, canvasY);
                return;
            }

            showNewNodePicker(e.clientX, e.clientY, canvasX, canvasY);
        }
    });

    // Right-click on canvas to show context menu
    app.addEventListener('contextmenu', e => {
        if (e.target === canvas || e.target.classList.contains('grid-overlay') || e.target === app) {
            e.preventDefault();
            const rect = app.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left - state.offsetX) / state.scale - 90;
            const canvasY = (e.clientY - rect.top - state.offsetY) / state.scale - 60;
            showCanvasContextMenu(e.clientX, e.clientY, canvasX, canvasY);
        }
    });

    // Single click on canvas in connecting mode - cancel connection after delay
    app.addEventListener('click', e => {
        if (state.connectSource && (e.target === canvas || e.target.classList.contains('grid-overlay') || e.target === app)) {
            // Clear any existing timer
            if (state.connectCancelTimer) {
                clearTimeout(state.connectCancelTimer);
            }
            // Set timer to cancel connection (allows double-click to override)
            state.setConnectCancelTimer(setTimeout(() => {
                state.setConnectCancelTimer(null);
                cancelConnection();
            }, 300));
        }
    });

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

            state.resizingItem.w = Math.max(140, x - state.resizingItem.x);
            state.resizingItem.h = Math.max(80, y - state.resizingItem.y);
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
    });

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
                saveState();
                state.setDraggedItem(null);
            }
            if (state.resizingItem) {
                // Mark item as manually resized - disables auto-resize
                state.resizingItem.manuallyResized = true;
                saveState();
                state.setResizingItem(null);
            }
            triggerAutoSave();
        }
    });
}

// ============ Touch Events ============

let lastDist = 0;

export function setupTouchEvents() {
    app.addEventListener('touchstart', e => {
        closeSidebarIfUnpinned();
        if (e.touches.length === 2) {
            lastDist = Math.hypot(
                e.touches[1].clientX - e.touches[0].clientX,
                e.touches[1].clientY - e.touches[0].clientY
            );
        } else if (e.touches.length === 1 && (e.target === canvas || e.target === app)) {
            state.setIsPanning(true);
            state.setStartX(e.touches[0].clientX - state.offsetX);
            state.setStartY(e.touches[0].clientY - state.offsetY);
        }
    });

    app.addEventListener('touchmove', e => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[1].clientX - e.touches[0].clientX,
                e.touches[1].clientY - e.touches[0].clientY
            );
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const rect = app.getBoundingClientRect();
            setZoom(state.scale * dist / lastDist, cx - rect.left, cy - rect.top, false);
            lastDist = dist;
        } else if (state.isPanning) {
            state.setOffsetX(e.touches[0].clientX - state.startX);
            state.setOffsetY(e.touches[0].clientY - state.startY);
            updateTransform();
            throttledMinimap();
        }
    }, { passive: false });

    app.addEventListener('touchend', () => state.setIsPanning(false));
}

// ============ Keyboard Events ============

export function setupKeyboardEvents() {
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
        if (e.key === 'Escape') {
            cancelConnection();
            closeLinkModal();
            closeSearch();
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
    });

    document.addEventListener('keyup', e => {
        if (e.code === 'Space' && state.isSpacePressed) {
            state.setIsSpacePressed(false);
            state.setIsSpacePanning(false);
            app.classList.remove('space-pan-mode');
            app.classList.remove('panning');
        }
    });
}

// ============ Drag & Drop Events ============

export function setupDragDropEvents() {
    window.addEventListener('dragenter', e => {
        e.preventDefault();
        dropZone.classList.add('active');
    });

    window.addEventListener('dragleave', e => {
        e.preventDefault();
        dropZone.classList.remove('active');
    });

    window.addEventListener('dragover', e => e.preventDefault());

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
    });
}

// ============ Paste Events ============

export function setupPasteEvents() {
    window.addEventListener('paste', e => {
        // Allow default paste behavior in input, textarea, and contenteditable elements
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.target.matches('[contenteditable="true"]') || e.target.closest('[contenteditable="true"]')) return;

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
    });
}

// ============ Document Click Handler ============

export function setupDocumentClickHandler() {
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
        if (!e.target.closest('.conn-direction-picker') && !e.target.closest('.connection-line')) {
            $('connDirectionPicker').classList.remove('active');
        }
        if (!e.target.closest('.child-type-picker') && !e.target.closest('.add-child-btn')) {
            $('childTypePicker').classList.remove('active');
        }
        if (!e.target.closest('.canvas-icon-picker') && !e.target.closest('.canvas-icon')) {
            $('canvasIconPicker').classList.remove('active');
            state.setIconPickerTarget(null);
        }
        if (!e.target.closest('.new-node-picker')) {
            $('newNodePicker').classList.remove('active');
            state.setNewNodePickerData(null);
        }
    });
}

