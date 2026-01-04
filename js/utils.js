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
// Optimized for graceful curves at any distance between nodes
export function curvePath(x1, y1, x2, y2, fromHandle = null, toHandle = null) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // For very close or overlapping points, use a simple line
    if (dist < 1) {
        return `M${x1} ${y1} L${x2} ${y2}`;
    }

    // Get handle directions as unit vectors
    const handleDirs = {
        top: { x: 0, y: -1 },
        bottom: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 }
    };

    // Direction from start to end (unit vector)
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Get handle direction vectors
    const fromDir = handleDirs[fromHandle] || { x: Math.sign(dx || 1), y: 0 };
    const toDir = handleDirs[toHandle] || { x: -Math.sign(dx || 1), y: 0 };

    // Calculate dot product to detect opposing directions
    // fromDot: positive when handle points toward target, negative when away
    const fromDot = fromDir.x * dirX + fromDir.y * dirY;
    const toDot = toDir.x * (-dirX) + toDir.y * (-dirY);

    // === Key fix: Distance-adaptive handle length calculation ===
    // The handle length must scale with distance to prevent control points from crossing

    // For short distances: handles should be proportionally shorter
    // For long distances: handles can be longer but capped
    const minHandleLength = Math.min(25, dist * 0.2);  // At least 20% of distance, max 25
    const maxHandleLength = Math.min(150, dist * 0.5); // At most 50% of distance, max 150

    // Base handle length: 35% of distance, within bounds
    const baseHandleLength = Math.max(minHandleLength, Math.min(dist * 0.35, maxHandleLength));

    // Calculate alignment factors - when handles align with direction, use longer handles
    const fromAlignmentFactor = Math.max(0.5, (1 + fromDot) / 2);
    const toAlignmentFactor = Math.max(0.5, (1 + toDot) / 2);

    // Handle lengths with reduced variance for close distances
    let fromHandleLength = baseHandleLength * (0.7 + fromAlignmentFactor * 0.5);
    let toHandleLength = baseHandleLength * (0.7 + toAlignmentFactor * 0.5);

    // === Critical: Ensure total handle length doesn't exceed safe threshold ===
    // When handles are too long relative to distance, curves become distorted
    const totalHandleLength = fromHandleLength + toHandleLength;
    const maxTotalLength = dist * 0.85; // Combined handles should not exceed 85% of distance

    if (totalHandleLength > maxTotalLength) {
        const scale = maxTotalLength / totalHandleLength;
        fromHandleLength *= scale;
        toHandleLength *= scale;
    }

    // Start with control points in handle direction
    let cp1x = x1 + fromDir.x * fromHandleLength;
    let cp1y = y1 + fromDir.y * fromHandleLength;
    let cp2x = x2 + toDir.x * toHandleLength;
    let cp2y = y2 + toDir.y * toHandleLength;

    // === S-curve smoothing for opposing directions ===
    // Scale the effect based on distance - less dramatic curves for close nodes
    const distFactor = Math.min(1, dist / 120); // Full effect at distance >= 120

    if (fromDot < 0) {
        // Handle points away from target - need to curve around
        const blendFactor = Math.min(0.3, Math.abs(fromDot) * 0.3) * distFactor;
        // Add perpendicular component for smoother curves
        const perpX = -fromDir.y;
        const perpY = fromDir.x;
        const perpDot = perpX * dirX + perpY * dirY;
        const perpSign = perpDot >= 0 ? 1 : -1;

        cp1x += dirX * dist * blendFactor;
        cp1y += dirY * dist * blendFactor;
        // Add slight perpendicular movement for smoother S-curves (reduced at close range)
        if (fromDot < -0.5) {
            const perpFactor = 0.08 * distFactor;
            cp1x += perpX * perpSign * dist * perpFactor;
            cp1y += perpY * perpSign * dist * perpFactor;
        }
    }

    if (toDot < 0) {
        const blendFactor = Math.min(0.3, Math.abs(toDot) * 0.3) * distFactor;
        const perpX = -toDir.y;
        const perpY = toDir.x;
        const perpDot = perpX * (-dirX) + perpY * (-dirY);
        const perpSign = perpDot >= 0 ? 1 : -1;

        cp2x -= dirX * dist * blendFactor;
        cp2y -= dirY * dist * blendFactor;
        if (toDot < -0.5) {
            const perpFactor = 0.08 * distFactor;
            cp2x += perpX * perpSign * dist * perpFactor;
            cp2y += perpY * perpSign * dist * perpFactor;
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
