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

    // Get handle directions as unit vectors
    const handleDirs = {
        top: { x: 0, y: -1 },
        bottom: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 }
    };

    // Direction from start to end
    const dirX = dist > 0 ? dx / dist : 1;
    const dirY = dist > 0 ? dy / dist : 0;

    // Get handle direction vectors
    const fromDir = handleDirs[fromHandle] || { x: Math.sign(dx || 1), y: 0 };
    const toDir = handleDirs[toHandle] || { x: -Math.sign(dx || 1), y: 0 };

    // Calculate dot product to detect opposing directions
    const fromDot = fromDir.x * dirX + fromDir.y * dirY;
    const toDot = toDir.x * (-dirX) + toDir.y * (-dirY);

    // Base handle length - longer for more pronounced direction, scales with distance
    const minHandleLength = 50;
    const maxHandleLength = 150;
    const baseHandleLength = Math.max(minHandleLength, Math.min(dist * 0.4, maxHandleLength));

    // Calculate alignment factors - when handles align with direction, use longer handles
    // When opposing, handles need to curve more dramatically
    const fromAlignmentFactor = Math.max(0.5, (1 + fromDot) / 2);
    const toAlignmentFactor = Math.max(0.5, (1 + toDot) / 2);

    // Handle lengths - make departing direction more pronounced
    const fromHandleLength = baseHandleLength * (0.7 + fromAlignmentFactor * 0.6);
    const toHandleLength = baseHandleLength * (0.7 + toAlignmentFactor * 0.6);

    // Start with control points in handle direction
    let cp1x = x1 + fromDir.x * fromHandleLength;
    let cp1y = y1 + fromDir.y * fromHandleLength;
    let cp2x = x2 + toDir.x * toHandleLength;
    let cp2y = y2 + toDir.y * toHandleLength;

    // For opposing directions, create smooth S-curves by blending towards target
    // Use progressive blending to ensure curves remain smooth without sharp bends
    if (fromDot < 0) {
        // Handle points away from target - need to curve around
        const blendFactor = Math.min(0.35, Math.abs(fromDot) * 0.35);
        // Add perpendicular component for smoother curves
        const perpX = -fromDir.y;
        const perpY = fromDir.x;
        const perpDot = perpX * dirX + perpY * dirY;
        const perpSign = perpDot >= 0 ? 1 : -1;

        cp1x += dirX * dist * blendFactor;
        cp1y += dirY * dist * blendFactor;
        // Add slight perpendicular movement for smoother S-curves
        if (fromDot < -0.5) {
            cp1x += perpX * perpSign * dist * 0.1;
            cp1y += perpY * perpSign * dist * 0.1;
        }
    }

    if (toDot < 0) {
        const blendFactor = Math.min(0.35, Math.abs(toDot) * 0.35);
        const perpX = -toDir.y;
        const perpY = toDir.x;
        const perpDot = perpX * (-dirX) + perpY * (-dirY);
        const perpSign = perpDot >= 0 ? 1 : -1;

        cp2x -= dirX * dist * blendFactor;
        cp2y -= dirY * dist * blendFactor;
        if (toDot < -0.5) {
            cp2x += perpX * perpSign * dist * 0.1;
            cp2y += perpY * perpSign * dist * 0.1;
        }
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
