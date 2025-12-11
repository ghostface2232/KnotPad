// KnotPad - Utility Functions

// DOM element selector by ID
export const $ = id => document.getElementById(id);

// Escape HTML entities for safe rendering
export function esc(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Generate unique ID
export function generateId() {
    return 'c' + Date.now() + Math.random().toString(36).substr(2, 5);
}

// Show toast notification
export function showToast(msg, type = 'success') {
    const toast = $('toast');
    toast.textContent = msg;
    toast.className = 'toast ' + type;
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// Calculate curved path for connections with directional handles
export function curvePath(x1, y1, x2, y2, fromHandle = null, toHandle = null) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const handleLength = Math.max(40, Math.min(dist * 0.4, 120));

    // Calculate control point offsets based on handle direction
    let cp1x = x1, cp1y = y1;
    let cp2x = x2, cp2y = y2;

    // First control point - direction from source handle
    switch (fromHandle) {
        case 'top':
            cp1y = y1 - handleLength;
            break;
        case 'bottom':
            cp1y = y1 + handleLength;
            break;
        case 'left':
            cp1x = x1 - handleLength;
            break;
        case 'right':
            cp1x = x1 + handleLength;
            break;
        default:
            // Fallback: horizontal direction based on dx
            cp1x = x1 + handleLength * Math.sign(dx || 1);
    }

    // Second control point - direction into target handle
    switch (toHandle) {
        case 'top':
            cp2y = y2 - handleLength;
            break;
        case 'bottom':
            cp2y = y2 + handleLength;
            break;
        case 'left':
            cp2x = x2 - handleLength;
            break;
        case 'right':
            cp2x = x2 + handleLength;
            break;
        default:
            // Fallback: horizontal direction based on dx
            cp2x = x2 - handleLength * Math.sign(dx || 1);
    }

    return `M${x1} ${y1} C${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
}

// Find free position for new items (avoid overlap)
export function findFreePosition(x, y, items) {
    let tries = 0;
    while (tries < 50 && items.some(i => Math.abs(x - i.x) < 10 && Math.abs(y - i.y) < 10)) {
        x += 6;
        y += 6;
        tries++;
    }
    return { x, y };
}

// Get handle position for connection points
export function getHandlePos(item, handle) {
    const { x, y, w, h } = item;
    const off = 10000;
    switch (handle) {
        case 'top': return { x: x + w / 2 + off, y: y + off };
        case 'bottom': return { x: x + w / 2 + off, y: y + h + off };
        case 'left': return { x: x + off, y: y + h / 2 + off };
        case 'right': return { x: x + w + off, y: y + h / 2 + off };
    }
}

// Get file extension from MIME type
export function getExtensionFromMimeType(mimeType) {
    const map = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov'
    };
    return map[mimeType] || '.bin';
}

// Easing function for animations
export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Clamp value between min and max
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
