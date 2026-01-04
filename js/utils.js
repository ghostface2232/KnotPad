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

// Handle direction lookup table (cached for performance)
const HANDLE_DIRS = {
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

// Legacy algorithm constants (for backward compatibility)
const LEGACY_MIN_HANDLE = 50;
const LEGACY_MAX_HANDLE = 150;
const LEGACY_HANDLE_RATIO = 0.4;

// Threshold for applying short-distance correction
const SHORT_DIST_THRESHOLD = 100;
const BLEND_RANGE = 50; // Blend over 50px range for smooth transition

// Calculate curved path for connections with directional handles
// Maintains legacy behavior for existing canvases while fixing distortion at close range
export function curvePath(x1, y1, x2, y2, fromHandle = null, toHandle = null) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distSq = dx * dx + dy * dy;

    // Fast path for overlapping points
    if (distSq < 1) {
        return `M${x1} ${y1} L${x2} ${y2}`;
    }

    const dist = Math.sqrt(distSq);
    const invDist = 1 / dist;

    // Direction unit vector
    const dirX = dx * invDist;
    const dirY = dy * invDist;

    // Get handle direction vectors (with fallback)
    const fromDir = HANDLE_DIRS[fromHandle] || { x: dx >= 0 ? 1 : -1, y: 0 };
    const toDir = HANDLE_DIRS[toHandle] || { x: dx >= 0 ? -1 : 1, y: 0 };

    // Dot products for direction alignment
    const fromDot = fromDir.x * dirX + fromDir.y * dirY;
    const toDot = toDir.x * (-dirX) + toDir.y * (-dirY);

    // === Legacy-compatible handle length calculation ===
    // Use original algorithm as base, apply correction only for short distances

    // Legacy base calculation (maintains existing canvas appearance)
    const legacyBase = Math.max(LEGACY_MIN_HANDLE, Math.min(dist * LEGACY_HANDLE_RATIO, LEGACY_MAX_HANDLE));

    // Alignment factors (unchanged from legacy)
    const fromAlignFactor = Math.max(0.5, (1 + fromDot) * 0.5);
    const toAlignFactor = Math.max(0.5, (1 + toDot) * 0.5);

    // Legacy handle lengths
    let fromHandleLen = legacyBase * (0.7 + fromAlignFactor * 0.6);
    let toHandleLen = legacyBase * (0.7 + toAlignFactor * 0.6);

    // === Short-distance correction (smoothly blended) ===
    // Only apply when nodes are close, with smooth transition to preserve legacy behavior
    if (dist < SHORT_DIST_THRESHOLD) {
        // Calculate blend factor: 0 at threshold, 1 at (threshold - BLEND_RANGE)
        const blendStart = SHORT_DIST_THRESHOLD - BLEND_RANGE;
        const correctionStrength = dist <= blendStart ? 1 :
            (SHORT_DIST_THRESHOLD - dist) / BLEND_RANGE;

        // Maximum safe total handle length (prevents control point crossing)
        const maxSafeTotal = dist * 0.8;
        const currentTotal = fromHandleLen + toHandleLen;

        if (currentTotal > maxSafeTotal) {
            // Smoothly blend toward corrected values
            const safeScale = maxSafeTotal / currentTotal;
            const blendedScale = 1 - correctionStrength * (1 - safeScale);
            fromHandleLen *= blendedScale;
            toHandleLen *= blendedScale;
        }
    }

    // Calculate control points
    let cp1x = x1 + fromDir.x * fromHandleLen;
    let cp1y = y1 + fromDir.y * fromHandleLen;
    let cp2x = x2 + toDir.x * toHandleLen;
    let cp2y = y2 + toDir.y * toHandleLen;

    // === S-curve smoothing for opposing directions ===
    if (fromDot < 0) {
        const blendFactor = Math.min(0.35, -fromDot * 0.35);
        cp1x += dirX * dist * blendFactor;
        cp1y += dirY * dist * blendFactor;

        if (fromDot < -0.5) {
            const perpX = -fromDir.y;
            const perpY = fromDir.x;
            const perpSign = (perpX * dirX + perpY * dirY) >= 0 ? 1 : -1;
            cp1x += perpX * perpSign * dist * 0.1;
            cp1y += perpY * perpSign * dist * 0.1;
        }
    }

    if (toDot < 0) {
        const blendFactor = Math.min(0.35, -toDot * 0.35);
        cp2x -= dirX * dist * blendFactor;
        cp2y -= dirY * dist * blendFactor;

        if (toDot < -0.5) {
            const perpX = -toDir.y;
            const perpY = toDir.x;
            const perpSign = (perpX * (-dirX) + perpY * (-dirY)) >= 0 ? 1 : -1;
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
