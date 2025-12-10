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

// Update connection arrow based on direction
export function updateConnectionArrow(c) {
    if (c.arrow) {
        c.arrow.remove();
        c.arrow = null;
    }

    if (c.dir === 'none') return;

    const fp = getHandlePos(c.from, c.fh);
    const tp = getHandlePos(c.to, c.th);
    const mx = (fp.x + tp.x) / 2;
    const my = (fp.y + tp.y) / 2;
    const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('connection-arrow');

    if (state.selectedConn === c) g.classList.add('selected');

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
