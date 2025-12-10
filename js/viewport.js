// KnotPad - Viewport Module (Zoom, Pan, Transform)

import { $ } from './utils.js';
import * as state from './state.js';

const canvas = $('canvas');
const zoomDisplay = $('zoomDisplay');

// Update canvas transform
export function updateTransform() {
    canvas.style.transform = `translate(${state.offsetX}px,${state.offsetY}px) scale(${state.scale})`;
    zoomDisplay.textContent = Math.round(state.scale * 100) + '%';

    // Set CSS variable for counter-scaling hover UI elements when zoomed out
    // This ensures minimum usability at low zoom levels
    const minScale = 0.5; // Below this scale, apply counter-scaling
    const counterScale = state.scale < minScale ? minScale / state.scale : 1;
    document.documentElement.style.setProperty('--counter-scale', counterScale);

    // Toggle low-zoom class for CSS targeting
    canvas.classList.toggle('low-zoom', state.scale < minScale);
}

// Set zoom level with optional center point and animation
export function setZoom(z, cx, cy, animate = true) {
    cx = cx ?? innerWidth / 2;
    cy = cy ?? innerHeight / 2;
    z = Math.max(0.1, Math.min(5, z));

    if (state.zoomAnimationFrame) {
        cancelAnimationFrame(state.zoomAnimationFrame);
        state.setZoomAnimationFrame(null);
    }

    if (!animate) {
        state.setOffsetX(cx - (cx - state.offsetX) * (z / state.scale));
        state.setOffsetY(cy - (cy - state.offsetY) * (z / state.scale));
        state.setScale(z);
        updateTransform();
        throttledMinimap();
        return;
    }

    const startScale = state.scale;
    const startOffsetX = state.offsetX;
    const startOffsetY = state.offsetY;
    const targetOffsetX = cx - (cx - state.offsetX) * (z / startScale);
    const targetOffsetY = cy - (cy - state.offsetY) * (z / startScale);
    const startTime = performance.now();
    const duration = 150;

    function animateZoom(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        state.setScale(startScale + (z - startScale) * ease);
        state.setOffsetX(startOffsetX + (targetOffsetX - startOffsetX) * ease);
        state.setOffsetY(startOffsetY + (targetOffsetY - startOffsetY) * ease);
        updateTransform();

        if (t < 1) {
            state.setZoomAnimationFrame(requestAnimationFrame(animateZoom));
        } else {
            state.setZoomAnimationFrame(null);
            updateMinimap();
        }
    }
    state.setZoomAnimationFrame(requestAnimationFrame(animateZoom));
}

// Fit all items to screen
export function fitToScreen() {
    if (!state.items.length) {
        state.setScale(1);
        state.setOffsetX(0);
        state.setOffsetY(0);
        updateTransform();
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.items.forEach(i => {
        minX = Math.min(minX, i.x);
        minY = Math.min(minY, i.y);
        maxX = Math.max(maxX, i.x + i.w);
        maxY = Math.max(maxY, i.y + i.h);
    });

    const padX = 60, padY = 80;
    const cw = maxX - minX + padX * 2;
    const ch = maxY - minY + padY * 2;
    const newScale = Math.min(Math.min((innerWidth - 60) / cw, (innerHeight - 120) / ch), 2) * 0.92;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const targetScale = newScale;
    const targetX = innerWidth / 2 - cx * targetScale;
    const targetY = (innerHeight - 60) / 2 - cy * targetScale;
    const startScale = state.scale;
    const startX = state.offsetX;
    const startY = state.offsetY;
    const startTime = performance.now();
    const duration = 250;

    function animate(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        state.setScale(startScale + (targetScale - startScale) * ease);
        state.setOffsetX(startX + (targetX - startX) * ease);
        state.setOffsetY(startY + (targetY - startY) * ease);
        updateTransform();
        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            zoomDisplay.textContent = Math.round(state.scale * 100) + '%';
            updateMinimap();
        }
    }
    requestAnimationFrame(animate);
}

// Pan to a specific item with optional animation
export function panToItem(item, animate = true) {
    const targetX = innerWidth / 2 - (item.x + item.w / 2) * state.scale;
    const targetY = innerHeight / 2 - (item.y + item.h / 2) * state.scale;

    if (animate) {
        const startX = state.offsetX;
        const startY = state.offsetY;
        const startTime = performance.now();
        const duration = 300;

        function animatePan(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            state.setOffsetX(startX + (targetX - startX) * ease);
            state.setOffsetY(startY + (targetY - startY) * ease);
            updateTransform();
            if (t < 1) {
                requestAnimationFrame(animatePan);
            } else {
                updateMinimap();
            }
        }
        requestAnimationFrame(animatePan);
    } else {
        state.setOffsetX(targetX);
        state.setOffsetY(targetY);
        updateTransform();
        updateMinimap();
    }
}

// Throttled minimap update
export function throttledMinimap() {
    if (state.minimapThrottle) return;
    state.setMinimapThrottle(requestAnimationFrame(() => {
        updateMinimap();
        state.setMinimapThrottle(null);
    }));
}

// Minimap update - will be set by ui.js
let minimapUpdateFn = () => {};
export function setMinimapUpdateFn(fn) {
    minimapUpdateFn = fn;
}

export function updateMinimap() {
    minimapUpdateFn();
}

// Start panning
export function startPan(x, y) {
    state.setIsPanning(true);
    state.setStartX(x - state.offsetX);
    state.setStartY(y - state.offsetY);
    $('app').classList.add('panning');
}
