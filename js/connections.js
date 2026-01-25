// KnotPad - Connections Module

import { COLOR_MAP } from './constants.js';
import { $, curvePath, getHandlePos } from './utils.js';
import * as state from './state.js';
import { throttledMinimap } from './viewport.js';
import { addMemo, deselectAll, hideMenus } from './items.js';
import eventBus, { Events } from './events-bus.js';

const canvas = $('canvas');
const connectionsSvg = $('connectionsSvg');
const connDirectionPicker = $('connDirectionPicker');
const connectionContextMenu = $('connectionContextMenu');
const connLabelModal = $('connLabelModal');
const connLabelModalInput = $('connLabelModalInput');
const connLabelBtn = $('connLabelBtn');

// Note: External function calls are now handled via eventBus
// Events emitted: STATE_SAVE, AUTOSAVE_TRIGGER

// Start drawing a connection
export function startConnection(item, handle) {
    state.setConnectSource(item);
    state.setConnectHandle(handle);
    canvas.classList.add('connecting');

    const pos = getHandlePos(item, handle);
    const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempLine.classList.add('connection-line', 'temp');

    if (item.color && COLOR_MAP[item.color]) {
        tempLine.style.stroke = COLOR_MAP[item.color];
    }

    connectionsSvg.appendChild(tempLine);
    state.setTempLine(tempLine);
    updateTempLine(pos.x, pos.y);
}

// Update temporary connection line
export function updateTempLine(ex, ey) {
    if (!state.tempLine || !state.connectSource) return;
    const sp = getHandlePos(state.connectSource, state.connectHandle);
    state.tempLine.setAttribute('d', curvePath(sp.x, sp.y, ex, ey, state.connectHandle, null));
}

// Complete a connection
export function completeConnection(target, handle) {
    if (!state.connectSource || state.connectSource === target) {
        cancelConnection();
        return;
    }

    // Remove existing connection between these items
    const existing = state.connections.find(c =>
        (c.from === state.connectSource && c.to === target) ||
        (c.from === target && c.to === state.connectSource)
    );
    if (existing) deleteConnection(existing, false);

    addConnection(state.connectSource, state.connectHandle, target, handle);
    cancelConnection();
    eventBus.emit(Events.STATE_SAVE);
}

// Cancel connection drawing
export function cancelConnection(withFade = false) {
    if (state.tempLine) {
        if (withFade) {
            // Fade out animation before removing
            const line = state.tempLine;
            line.classList.add('fading');
            line.addEventListener('animationend', () => line.remove(), { once: true });
        } else {
            state.tempLine.remove();
        }
        state.setTempLine(null);
    }
    state.setConnectSource(null);
    state.setConnectHandle(null);
    canvas.classList.remove('connecting');
    state.items.forEach(i => i.el.classList.remove('connect-target'));
}

// Add a connection between two items
export function addConnection(from, fh, to, th, loading = false, savedId = null) {
    // Validate: prevent self-connections (same item connected to itself)
    if (from === to) {
        console.warn('Prevented self-connection: same item cannot be connected to itself');
        return null;
    }

    const conn = {
        id: savedId || `c${Date.now()}`,
        from,
        fh,
        to,
        th,
        el: null,
        hitArea: null,
        arrow: null,
        dir: 'none',
        label: '',
        labelEl: null
    };

    // Create invisible hit area for easier clicking (wider stroke)
    const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitArea.classList.add('connection-hit-area');
    hitArea.addEventListener('click', e => {
        e.stopPropagation();
        selectConnection(conn, e);
    });
    hitArea.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showConnectionContextMenu(conn, e);
    });

    // Create visible connection line
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection-line');
    path.addEventListener('click', e => {
        e.stopPropagation();
        selectConnection(conn, e);
    });
    path.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showConnectionContextMenu(conn, e);
    });

    connectionsSvg.appendChild(hitArea);
    connectionsSvg.appendChild(path);
    conn.hitArea = hitArea;
    conn.el = path;
    state.connections.push(conn);
    updateConnection(conn);

    if (!loading) {
        throttledMinimap();
        eventBus.emit(Events.AUTOSAVE_TRIGGER);
    }

    return conn;
}

// Update a connection's path and appearance
export function updateConnection(c) {
    const fp = getHandlePos(c.from, c.fh);
    const tp = getHandlePos(c.to, c.th);
    const pathData = curvePath(fp.x, fp.y, tp.x, tp.y, c.fh, c.th);
    c.el.setAttribute('d', pathData);

    // Update hit area with same path
    if (c.hitArea) {
        c.hitArea.setAttribute('d', pathData);
    }

    // Apply color from source node
    if (c.from.color && COLOR_MAP[c.from.color]) {
        c.el.style.stroke = COLOR_MAP[c.from.color];
    } else {
        c.el.style.stroke = '';
    }

    updateConnectionArrow(c);
    updateConnectionLabel(c);
}

// Update connection label position and visibility
export function updateConnectionLabel(c) {
    // Remove existing label if empty
    if (!c.label) {
        if (c.labelEl) {
            c.labelEl.remove();
            c.labelEl = null;
        }
        return;
    }

    // Create label element if needed
    if (!c.labelEl) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('connection-label');

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.classList.add('connection-label-bg');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.classList.add('connection-label-text');

        g.appendChild(rect);
        g.appendChild(text);

        // Make label clickable to select connection
        g.addEventListener('click', e => {
            e.stopPropagation();
            selectConnection(c, e);
        });

        connectionsSvg.appendChild(g);
        c.labelEl = g;
    }

    // Update label text
    const text = c.labelEl.querySelector('text');
    text.textContent = c.label;

    // Get midpoint of the connection path
    const fp = getHandlePos(c.from, c.fh);
    const tp = getHandlePos(c.to, c.th);
    const midPoint = getPathMidpoint(c.el);

    // Calculate approximate text width (for centering)
    const charWidth = 7;
    const textWidth = c.label.length * charWidth;
    const paddingX = 12;
    const paddingY = 4;
    const height = 22;
    const width = Math.max(textWidth + paddingX * 2, 40);

    // Position text at center
    text.setAttribute('x', midPoint.x);
    text.setAttribute('y', midPoint.y);
    text.setAttribute('text-anchor', 'middle');

    // Position and size the background pill
    const rect = c.labelEl.querySelector('rect');
    rect.setAttribute('x', midPoint.x - width / 2);
    rect.setAttribute('y', midPoint.y - height / 2);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('rx', height / 2);

    // Apply color from source node to border (not fill for better contrast)
    if (c.from.color && COLOR_MAP[c.from.color]) {
        rect.style.stroke = COLOR_MAP[c.from.color];
    } else {
        rect.style.stroke = '';
    }

    // Add selected class if connection is selected
    if (state.selectedConn === c) {
        c.labelEl.classList.add('selected');
    } else {
        c.labelEl.classList.remove('selected');
    }
}

// Get the midpoint of a path element
function getPathMidpoint(pathEl) {
    try {
        const totalLength = pathEl.getTotalLength();
        const midPoint = pathEl.getPointAtLength(totalLength / 2);
        return { x: midPoint.x, y: midPoint.y };
    } catch (e) {
        // Fallback if path is invalid
        return { x: 10000, y: 10000 };
    }
}

// Calculate point on cubic Bezier curve at parameter t
function bezierPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    return {
        x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
        y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
    };
}

// Calculate tangent angle on cubic Bezier curve at parameter t
function bezierTangent(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    // Derivative of Bezier curve
    const dx = 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x);
    const dy = 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y);
    return Math.atan2(dy, dx);
}

// Handle direction lookup (cached)
const ARROW_HANDLE_DIRS = {
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

// Update connection arrow based on direction
// Uses same algorithm as curvePath for consistency
export function updateConnectionArrow(c) {
    if (c.arrow) {
        c.arrow.remove();
        c.arrow = null;
    }

    if (c.dir === 'none') return;

    const fp = getHandlePos(c.from, c.fh);
    const tp = getHandlePos(c.to, c.th);

    const dx = tp.x - fp.x;
    const dy = tp.y - fp.y;
    const distSq = dx * dx + dy * dy;

    // Handle very close points
    if (distSq < 1) return;

    const dist = Math.sqrt(distSq);
    const invDist = 1 / dist;
    const dirX = dx * invDist;
    const dirY = dy * invDist;

    const fromDir = ARROW_HANDLE_DIRS[c.fh] || { x: dx >= 0 ? 1 : -1, y: 0 };
    const toDir = ARROW_HANDLE_DIRS[c.th] || { x: dx >= 0 ? -1 : 1, y: 0 };

    const fromDot = fromDir.x * dirX + fromDir.y * dirY;
    const toDot = toDir.x * (-dirX) + toDir.y * (-dirY);

    // === Legacy-compatible calculation (matching curvePath) ===
    const legacyBase = Math.max(50, Math.min(dist * 0.4, 150));
    const fromAlignFactor = Math.max(0.5, (1 + fromDot) * 0.5);
    const toAlignFactor = Math.max(0.5, (1 + toDot) * 0.5);

    let fromHandleLen = legacyBase * (0.7 + fromAlignFactor * 0.6);
    let toHandleLen = legacyBase * (0.7 + toAlignFactor * 0.6);

    // Short-distance correction (smoothly blended)
    if (dist < 100) {
        const blendStart = 50;
        const correctionStrength = dist <= blendStart ? 1 : (100 - dist) / 50;
        const maxSafeTotal = dist * 0.8;
        const currentTotal = fromHandleLen + toHandleLen;

        if (currentTotal > maxSafeTotal) {
            const safeScale = maxSafeTotal / currentTotal;
            const blendedScale = 1 - correctionStrength * (1 - safeScale);
            fromHandleLen *= blendedScale;
            toHandleLen *= blendedScale;
        }
    }

    const p0 = { x: fp.x, y: fp.y };
    const p3 = { x: tp.x, y: tp.y };
    let p1 = { x: fp.x + fromDir.x * fromHandleLen, y: fp.y + fromDir.y * fromHandleLen };
    let p2 = { x: tp.x + toDir.x * toHandleLen, y: tp.y + toDir.y * toHandleLen };

    // S-curve smoothing for opposing directions
    if (fromDot < 0) {
        const blendFactor = Math.min(0.35, -fromDot * 0.35);
        p1.x += dirX * dist * blendFactor;
        p1.y += dirY * dist * blendFactor;

        if (fromDot < -0.5) {
            const perpX = -fromDir.y;
            const perpY = fromDir.x;
            const perpSign = (perpX * dirX + perpY * dirY) >= 0 ? 1 : -1;
            p1.x += perpX * perpSign * dist * 0.1;
            p1.y += perpY * perpSign * dist * 0.1;
        }
    }

    if (toDot < 0) {
        const blendFactor = Math.min(0.35, -toDot * 0.35);
        p2.x -= dirX * dist * blendFactor;
        p2.y -= dirY * dist * blendFactor;

        if (toDot < -0.5) {
            const perpX = -toDir.y;
            const perpY = toDir.x;
            const perpSign = (perpX * (-dirX) + perpY * (-dirY)) >= 0 ? 1 : -1;
            p2.x += perpX * perpSign * dist * 0.1;
            p2.y += perpY * perpSign * dist * 0.1;
        }
    }

    // Get midpoint on the actual Bezier curve
    const mid = bezierPoint(p0, p1, p2, p3, 0.5);
    const angle = bezierTangent(p0, p1, p2, p3, 0.5);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('connection-arrow');

    if (state.selectedConn === c) g.classList.add('selected');

    // Apply color from source node
    if (c.from.color && COLOR_MAP[c.from.color]) {
        g.style.fill = COLOR_MAP[c.from.color];
    }

    const size = 12; // Increased arrow size for better visibility

    if (c.dir === 'forward' || c.dir === 'both') {
        const arr = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        // Arrow pointing in direction of curve
        const offset = c.dir === 'both' ? 14 : 0;
        const ax = mid.x + offset * Math.cos(angle);
        const ay = mid.y + offset * Math.sin(angle);
        // Calculate arrow vertices
        const tipX = ax + size * Math.cos(angle);
        const tipY = ay + size * Math.sin(angle);
        const backAngle1 = angle + Math.PI * 0.85;
        const backAngle2 = angle - Math.PI * 0.85;
        const back1X = ax + size * 0.7 * Math.cos(backAngle1);
        const back1Y = ay + size * 0.7 * Math.sin(backAngle1);
        const back2X = ax + size * 0.7 * Math.cos(backAngle2);
        const back2Y = ay + size * 0.7 * Math.sin(backAngle2);
        arr.setAttribute('points', `${tipX},${tipY} ${back1X},${back1Y} ${back2X},${back2Y}`);
        g.appendChild(arr);
    }

    if (c.dir === 'backward' || c.dir === 'both') {
        const arr = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        // Arrow pointing opposite to direction of curve
        const offset = c.dir === 'both' ? -14 : 0;
        const ax = mid.x + offset * Math.cos(angle);
        const ay = mid.y + offset * Math.sin(angle);
        const reverseAngle = angle + Math.PI;
        // Calculate arrow vertices
        const tipX = ax + size * Math.cos(reverseAngle);
        const tipY = ay + size * Math.sin(reverseAngle);
        const backAngle1 = reverseAngle + Math.PI * 0.85;
        const backAngle2 = reverseAngle - Math.PI * 0.85;
        const back1X = ax + size * 0.7 * Math.cos(backAngle1);
        const back1Y = ay + size * 0.7 * Math.sin(backAngle1);
        const back2X = ax + size * 0.7 * Math.cos(backAngle2);
        const back2Y = ay + size * 0.7 * Math.sin(backAngle2);
        arr.setAttribute('points', `${tipX},${tipY} ${back1X},${back1Y} ${back2X},${back2Y}`);
        g.appendChild(arr);
    }

    connectionsSvg.appendChild(g);
    c.arrow = g;
}

// Update all connections
export function updateAllConnections() {
    state.connections.forEach(updateConnection);
}

// Select a connection
export function selectConnection(c, e) {
    deselectAll();
    state.setSelectedConn(c);
    c.el.classList.add('selected');
    if (c.arrow) c.arrow.classList.add('selected');
    showConnDirectionPicker(e.clientX, e.clientY, c);
}

// Delete a connection
export function deleteConnection(c, save = true, withFade = true) {
    const i = state.connections.indexOf(c);
    if (i > -1) {
        state.connections.splice(i, 1);
        state.setSelectedConn(null);
        connDirectionPicker.classList.remove('active');

        if (withFade) {
            // Add fade animation then remove
            c.el.classList.add('deleting');
            if (c.hitArea) c.hitArea.classList.add('deleting');
            if (c.arrow) c.arrow.classList.add('deleting');
            if (c.labelEl) c.labelEl.classList.add('deleting');
            c.el.addEventListener('animationend', () => {
                c.el.remove();
                if (c.hitArea) c.hitArea.remove();
                if (c.arrow) c.arrow.remove();
                if (c.labelEl) c.labelEl.remove();
            }, { once: true });
        } else {
            c.el.remove();
            if (c.hitArea) c.hitArea.remove();
            if (c.arrow) c.arrow.remove();
            if (c.labelEl) c.labelEl.remove();
        }

        if (save) {
            eventBus.emit(Events.STATE_SAVE);
            eventBus.emit(Events.AUTOSAVE_TRIGGER);
        }
        throttledMinimap();
    }
}

// Show connection direction picker
function showConnDirectionPicker(x, y, conn) {
    connDirectionPicker.style.left = x + 'px';
    connDirectionPicker.style.top = y + 'px';
    connDirectionPicker.querySelectorAll('button[data-dir]').forEach(b =>
        b.classList.toggle('active', b.dataset.dir === conn.dir)
    );
    // Update label button state
    if (connLabelBtn) {
        connLabelBtn.classList.toggle('has-label', !!conn.label);
    }
    connDirectionPicker.classList.add('active');
}

// Setup direction picker event handlers
export function setupConnDirectionPicker() {
    connDirectionPicker.querySelectorAll('button[data-dir]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            if (state.selectedConn) {
                state.selectedConn.dir = btn.dataset.dir;
                updateConnectionArrow(state.selectedConn);
                eventBus.emit(Events.STATE_SAVE);
                eventBus.emit(Events.AUTOSAVE_TRIGGER);
            }
            connDirectionPicker.classList.remove('active');
            deselectConnection();
        });
    });

    // Label button handler - opens modal
    if (connLabelBtn) {
        connLabelBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (state.selectedConn) {
                openConnLabelModal();
            }
        });
    }

    // Setup label modal
    setupConnLabelModal();

    // Delete button handler
    const deleteBtn = connDirectionPicker.querySelector('.conn-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (state.selectedConn) {
                deleteConnection(state.selectedConn);
            }
            connDirectionPicker.classList.remove('active');
        });
    }
}

// Open connection label modal with animation from picker position
function openConnLabelModal() {
    if (!connLabelModal || !connLabelModalInput) return;

    connLabelModalInput.value = state.selectedConn?.label || '';

    // Get picker position for animation start point
    const pickerRect = connDirectionPicker.getBoundingClientRect();
    const modalBox = connLabelModal.querySelector('.conn-label-modal-box');

    // Position modal box at picker location initially
    modalBox.style.left = pickerRect.left + 'px';
    modalBox.style.top = pickerRect.top + 'px';
    modalBox.style.transform = 'scale(0.85)';
    modalBox.style.opacity = '0';

    connLabelModal.classList.add('active');
    connDirectionPicker.classList.remove('active');

    // Trigger animation
    requestAnimationFrame(() => {
        connLabelModal.classList.add('animate-in');
        modalBox.style.transform = 'scale(1)';
        modalBox.style.opacity = '1';
    });

    setTimeout(() => {
        connLabelModalInput.focus();
        connLabelModalInput.select();
    }, 100);
}

// Close connection label modal with animation
function closeConnLabelModal(save = false) {
    if (!connLabelModal) return;

    if (save && state.selectedConn) {
        state.selectedConn.label = connLabelModalInput.value.trim();
        updateConnectionLabel(state.selectedConn);
        eventBus.emit(Events.STATE_SAVE);
        eventBus.emit(Events.AUTOSAVE_TRIGGER);
    }

    const modalBox = connLabelModal.querySelector('.conn-label-modal-box');

    // Animate out
    connLabelModal.classList.remove('animate-in');
    modalBox.style.transform = 'scale(0.9)';
    modalBox.style.opacity = '0';

    setTimeout(() => {
        connLabelModal.classList.remove('active');
        // Reset styles
        modalBox.style.transform = '';
        modalBox.style.opacity = '';
    }, 150);

    deselectConnection();
}

// Deselect connection and clear selection state
export function deselectConnection() {
    if (state.selectedConn) {
        state.selectedConn.el.classList.remove('selected');
        if (state.selectedConn.arrow) state.selectedConn.arrow.classList.remove('selected');
        if (state.selectedConn.labelEl) state.selectedConn.labelEl.classList.remove('selected');
        state.setSelectedConn(null);
    }
}

// Setup label modal event handlers
function setupConnLabelModal() {
    if (!connLabelModal) return;

    const confirmBtn = $('connLabelModalConfirm');
    const cancelBtn = $('connLabelModalCancel');

    if (confirmBtn) {
        confirmBtn.addEventListener('click', e => {
            e.stopPropagation();
            closeConnLabelModal(true);
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', e => {
            e.stopPropagation();
            closeConnLabelModal(false);
        });
    }

    // Close on background click
    connLabelModal.addEventListener('click', e => {
        if (e.target === connLabelModal) {
            closeConnLabelModal(false);
        }
    });

    // Handle Enter and Escape keys
    connLabelModalInput.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            closeConnLabelModal(true);
        } else if (e.key === 'Escape') {
            closeConnLabelModal(false);
        }
    });

    // Prevent clicks inside modal from closing
    const modalBox = connLabelModal.querySelector('.conn-label-modal-box');
    if (modalBox) {
        modalBox.addEventListener('click', e => {
            e.stopPropagation();
        });
    }
}

// Show connection context menu
function showConnectionContextMenu(conn, e) {
    hideMenus(); // Close other context menus first
    deselectAll();
    state.setSelectedConn(conn);
    conn.el.classList.add('selected');
    if (conn.arrow) conn.arrow.classList.add('selected');

    connectionContextMenu.style.left = e.clientX + 'px';
    connectionContextMenu.style.top = e.clientY + 'px';
    connectionContextMenu.classList.add('active');
}

// Setup connection context menu
export function setupConnectionContextMenu() {
    connectionContextMenu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', () => {
            if (el.dataset.action === 'delete' && state.selectedConn) {
                deleteConnection(state.selectedConn);
            }
            connectionContextMenu.classList.remove('active');
        });
    });
}

// Complete connection by creating a new memo at the specified position
export function completeConnectionWithNewMemo(canvasX, canvasY) {
    if (!state.connectSource) return null;

    const source = state.connectSource;
    const sourceHandle = state.connectHandle;

    // Determine the opposite handle for the new memo
    const oppositeHandle = {
        'top': 'bottom',
        'bottom': 'top',
        'left': 'right',
        'right': 'left'
    }[sourceHandle] || 'top';

    // Create new memo with the same color as source
    const newMemo = addMemo('', canvasX, canvasY, source.color);

    // Create connection
    addConnection(source, sourceHandle, newMemo, oppositeHandle);
    cancelConnection();
    eventBus.emit(Events.STATE_SAVE);

    return newMemo;
}

// Add child node connected to parent (always creates memo)
export function addChildNode(parent, dir) {
    const gap = 100;
    const cw = 220;
    const ch = 140;
    let x, y, fh, th;

    switch (dir) {
        case 'top':
            x = parent.x + parent.w / 2 - cw / 2;
            y = parent.y - ch - gap;
            fh = 'top';
            th = 'bottom';
            break;
        case 'bottom':
            x = parent.x + parent.w / 2 - cw / 2;
            y = parent.y + parent.h + gap;
            fh = 'bottom';
            th = 'top';
            break;
        case 'left':
            x = parent.x - cw - gap;
            y = parent.y + (parent.h - ch) / 2;
            fh = 'left';
            th = 'right';
            break;
        case 'right':
            x = parent.x + parent.w + gap;
            y = parent.y + (parent.h - ch) / 2;
            fh = 'right';
            th = 'left';
            break;
    }

    const child = addMemo('', x, y, parent.color);
    addConnection(parent, fh, child, th);
    eventBus.emit(Events.STATE_SAVE);
    return child;
}
