// KnotPad - Canvas Sidebar Module
// Handles canvas list rendering, drag-and-drop, and sidebar UI
//
// Exports:
// - formatRelativeDate, getCanvasIconHTML, getCanvasIconStyle (rendering helpers)
// - renderCanvasEntry, renderGroupHTML (HTML generators)
// - setupCanvasDragDrop, setupGroupDragDrop, reorderCanvas (drag-and-drop)

import { CANVAS_ICONS, COLOR_MAP } from './constants.js';
import { esc } from './utils.js';
import * as state from './state.js';

// ============ Rendering Helpers ============

/**
 * Format timestamp as relative date (e.g., "5m ago", "2d ago")
 */
export function formatRelativeDate(timestamp) {
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

/**
 * Get canvas icon HTML (either custom icon or first letter)
 */
export function getCanvasIconHTML(c) {
    if (c.icon && CANVAS_ICONS[c.icon]) return CANVAS_ICONS[c.icon];
    return `<span class="icon-letter">${esc((c.name || 'U').charAt(0).toUpperCase())}</span>`;
}

/**
 * Get canvas icon inline style (for colored canvases)
 */
export function getCanvasIconStyle(c, isActive) {
    if (c.color && COLOR_MAP[c.color]) {
        return `background: ${COLOR_MAP[c.color]}${isActive ? '' : '33'}; ${isActive ? 'color: white;' : `color: ${COLOR_MAP[c.color]};`}`;
    }
    return '';
}

// ============ HTML Generators ============

/**
 * Render a single canvas entry HTML
 */
export function renderCanvasEntry(c, currentCanvasId) {
    const isActive = c.id === currentCanvasId;
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

/**
 * Render a canvas group HTML with its children
 */
export function renderGroupHTML(group, canvasesInGroup, currentCanvasId, collapsedGroups) {
    const isCollapsed = collapsedGroups.has(group.id);
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
                ${canvasesInGroup.map(c => renderCanvasEntry(c, currentCanvasId)).join('')}
            </div>
        </div>
    `;
}

// ============ Drag and Drop ============

/**
 * Setup drag-and-drop for a canvas entry
 * @param {HTMLElement} entry - The canvas entry element
 * @param {string} canvasId - The canvas ID
 * @param {AbortSignal} signal - AbortController signal for cleanup
 * @param {HTMLElement} canvasList - The canvas list container
 * @param {Function} onReorder - Callback when canvas is reordered: (draggedId, targetId, insertBefore) => void
 */
export function setupCanvasDragDrop(entry, canvasId, signal, canvasList, onReorder) {
    entry.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', canvasId);
        e.dataTransfer.effectAllowed = 'move';
        entry.classList.add('dragging');
        canvasList.classList.add('drag-active');
        setTimeout(() => {
            entry.style.opacity = '0.4';
        }, 0);
    }, { signal });

    entry.addEventListener('dragend', () => {
        entry.classList.remove('dragging');
        entry.style.opacity = '';
        canvasList.classList.remove('drag-active');
        canvasList.querySelectorAll('.drag-over, .drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });
    }, { signal });

    entry.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        if (entry.classList.contains('dragging')) return;

        const rect = entry.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isAbove = e.clientY < midY;

        entry.classList.remove('drag-over-top', 'drag-over-bottom');
        entry.classList.add(isAbove ? 'drag-over-top' : 'drag-over-bottom');
    }, { signal });

    entry.addEventListener('dragenter', e => {
        e.preventDefault();
        e.stopPropagation();
    }, { signal });

    entry.addEventListener('dragleave', e => {
        const relatedTarget = e.relatedTarget;
        if (!entry.contains(relatedTarget)) {
            entry.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        }
    }, { signal });

    entry.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();

        const isAbove = entry.classList.contains('drag-over-top');
        entry.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');

        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== canvasId) {
            onReorder(draggedId, canvasId, isAbove);
        }
    }, { signal });
}

/**
 * Setup drag-and-drop for a group header (to move canvases into groups)
 * @param {HTMLElement} header - The group header element
 * @param {string} groupId - The group ID
 * @param {AbortSignal} signal - AbortController signal for cleanup
 * @param {Function} onMoveToGroup - Callback when canvas is moved to group: (canvasId, groupId) => void
 */
export function setupGroupDragDrop(header, groupId, signal, onMoveToGroup) {
    header.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, { signal });

    header.addEventListener('dragenter', e => {
        e.preventDefault();
        header.classList.add('drag-over');
    }, { signal });

    header.addEventListener('dragleave', () => {
        header.classList.remove('drag-over');
    }, { signal });

    header.addEventListener('drop', e => {
        e.preventDefault();
        header.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId) {
            onMoveToGroup(draggedId, groupId);
        }
    }, { signal });
}

/**
 * Reorder a canvas in the list
 * @param {string} draggedId - ID of the dragged canvas
 * @param {string} targetId - ID of the target canvas
 * @param {boolean} insertBefore - Whether to insert before or after target
 * @param {Function} onSave - Callback to save changes
 * @param {Function} onRender - Callback to re-render the list
 */
export function reorderCanvas(draggedId, targetId, insertBefore, onSave, onRender) {
    const draggedIdx = state.canvases.findIndex(c => c.id === draggedId);
    const targetIdx = state.canvases.findIndex(c => c.id === targetId);

    if (draggedIdx === -1 || targetIdx === -1 || draggedIdx === targetIdx) return;

    const targetCanvas = state.canvases[targetIdx];
    const [draggedCanvas] = state.canvases.splice(draggedIdx, 1);
    // Match target's group
    draggedCanvas.groupId = targetCanvas.groupId || null;

    // Find where target is now after removal
    const newTargetIdx = state.canvases.findIndex(c => c.id === targetId);
    const insertIdx = insertBefore ? newTargetIdx : newTargetIdx + 1;
    state.canvases.splice(insertIdx, 0, draggedCanvas);

    onSave();
    onRender();
}

/**
 * Move a canvas to a specific group
 * @param {string} canvasId - ID of the canvas to move
 * @param {string|null} groupId - ID of the target group (null for ungrouped)
 * @param {Function} onSave - Callback to save changes
 * @param {Function} onRender - Callback to re-render the list
 */
export function moveCanvasToGroup(canvasId, groupId, onSave, onRender) {
    const canvas = state.canvases.find(c => c.id === canvasId);
    if (canvas) {
        canvas.groupId = groupId;
        onSave();
        onRender();
    }
}
