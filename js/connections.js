// KnotPad - Connections Module

import { COLOR_MAP } from './constants.js';
import { $, curvePath, getHandlePos } from './utils.js';
import * as state from './state.js';
import { throttledMinimap } from './viewport.js';
import { addNote, addMemo, deselectAll } from './items.js';

const canvas = $('canvas');
const connectionsSvg = $('connectionsSvg');
const connDirectionPicker = $('connDirectionPicker');

// External function references
let saveStateFn = () => {};
let triggerAutoSaveFn = () => {};

export function setExternalFunctions({ saveState, triggerAutoSave }) {
    if (saveState) saveStateFn = saveState;
    if (triggerAutoSave) triggerAutoSaveFn = triggerAutoSave;
}

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
    state.tempLine.setAttribute('d', curvePath(sp.x, sp.y, ex, ey));
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
    saveStateFn();
}

// Cancel connection drawing
export function cancelConnection() {
    if (state.tempLine) {
        state.tempLine.remove();
        state.setTempLine(null);
    }
    state.setConnectSource(null);
    state.setConnectHandle(null);
    canvas.classList.remove('connecting');
    state.items.forEach(i => i.el.classList.remove('connect-target'));
}

// Add a connection between two items
export function addConnection(from, fh, to, th, loading = false) {
    const conn = {
        id: `c${Date.now()}`,
        from,
        fh,
        to,
        th,
        el: null,
        arrow: null,
        dir: 'none'
    };

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection-line');
    path.addEventListener('click', e => {
        e.stopPropagation();
        selectConnection(conn, e);
    });

    connectionsSvg.appendChild(path);
    conn.el = path;
    state.connections.push(conn);
    updateConnection(conn);

    if (!loading) {
        throttledMinimap();
        triggerAutoSaveFn();
    }

    return conn;
}

// Update a connection's path and appearance
export function updateConnection(c) {
    const fp = getHandlePos(c.from, c.fh);
    const tp = getHandlePos(c.to, c.th);
    c.el.setAttribute('d', curvePath(fp.x, fp.y, tp.x, tp.y));

    // Apply color from source node
    if (c.from.color && COLOR_MAP[c.from.color]) {
        c.el.style.stroke = COLOR_MAP[c.from.color];
    } else {
        c.el.style.stroke = '';
    }

    updateConnectionArrow(c);
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

// Update connection arrow based on direction
export function updateConnectionArrow(c) {
    if (c.arrow) {
        c.arrow.remove();
        c.arrow = null;
    }

    if (c.dir === 'none') return;

    const fp = getHandlePos(c.from, c.fh);
    const tp = getHandlePos(c.to, c.th);

    // Calculate control points for the cubic Bezier curve (matching curvePath in utils.js)
    const dx = tp.x - fp.x;
    const dy = tp.y - fp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const curve = Math.min(dist * 0.3, 80);

    const p0 = { x: fp.x, y: fp.y };
    const p1 = { x: fp.x + curve * Math.sign(dx || 1), y: fp.y };
    const p2 = { x: tp.x - curve * Math.sign(dx || 1), y: tp.y };
    const p3 = { x: tp.x, y: tp.y };

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
        const offset = 8;
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
        const offset = -8;
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
export function deleteConnection(c, save = true) {
    const i = state.connections.indexOf(c);
    if (i > -1) {
        state.connections.splice(i, 1);
        c.el.remove();
        if (c.arrow) c.arrow.remove();
        state.setSelectedConn(null);
        if (save) {
            saveStateFn();
            triggerAutoSaveFn();
        }
        throttledMinimap();
    }
}

// Show connection direction picker
function showConnDirectionPicker(x, y, conn) {
    connDirectionPicker.style.left = x + 'px';
    connDirectionPicker.style.top = y + 'px';
    connDirectionPicker.querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b.dataset.dir === conn.dir)
    );
    connDirectionPicker.classList.add('active');
}

// Setup direction picker event handlers
export function setupConnDirectionPicker() {
    connDirectionPicker.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            if (state.selectedConn) {
                state.selectedConn.dir = btn.dataset.dir;
                updateConnectionArrow(state.selectedConn);
                saveStateFn();
                triggerAutoSaveFn();
            }
            connDirectionPicker.classList.remove('active');
        });
    });
}

// Add child node connected to parent
export function addChildNode(parent, dir, type = 'note') {
    const gap = 72;
    const cw = type === 'note' ? 220 : 180;
    const ch = type === 'note' ? 140 : 100;
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
            y = parent.y + parent.h / 2 - ch / 2;
            fh = 'left';
            th = 'right';
            break;
        case 'right':
            x = parent.x + parent.w + gap;
            y = parent.y + parent.h / 2 - ch / 2;
            fh = 'right';
            th = 'left';
            break;
    }

    const child = type === 'memo' ? addMemo('', x, y, parent.color) : addNote('', '', x, y, parent.color);
    addConnection(parent, fh, child, th);
    saveStateFn();
    return child;
}
