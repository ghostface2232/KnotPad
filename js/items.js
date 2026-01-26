// KnotPad - Items Module (Create, Manage, Delete)

import { COLORS, COLOR_MAP, FONT_SIZES } from './constants.js';
import { $, esc, findFreePosition } from './utils.js';
import * as state from './state.js';
import { throttledMinimap, updateMinimap } from './viewport.js';
import { deleteMedia, deleteMediaFromFileSystem, fsDirectoryHandle, loadMedia, loadMediaFromFileSystem } from './storage.js';
import eventBus, { Events } from './events-bus.js';

const canvas = $('canvas');

// ============ Favicon Fallback ============
// Globe icon SVG as data URI for when favicon fails to load
const FALLBACK_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='2' y1='12' x2='22' y2='12'/%3E%3Cpath d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/%3E%3C/svg%3E";

// Setup favicon error handler - show fallback globe icon when favicon fails to load
function setupFaviconErrorHandler(imgElement) {
    imgElement.onerror = () => {
        imgElement.onerror = null; // Prevent infinite loop
        imgElement.src = FALLBACK_FAVICON;
    };
}

// Export for use in ui.js
export { FALLBACK_FAVICON, setupFaviconErrorHandler };

// ============ Link Preview & Metadata ============
// Load preview image and fetch page title for link items using screenshot API

export function loadLinkPreviewForItem(item) {
    if (item.type !== 'link') return;

    const el = item.el;
    const itemLink = el.querySelector('.item-link');
    if (!itemLink) return;

    // Skip if already fetched metadata
    if (item._metadataFetched) {
        // Only skip preview if it already exists
        if (el.querySelector('.link-preview-img') || !state.linkPreviewEnabled) return;
    }
    item._metadataFetched = true;

    const url = item.content.url;
    const domain = new URL(url).hostname;
    const hasPreviewImage = el.querySelector('.link-preview-img');

    // Determine if we need screenshot (for preview) - always fetch metadata for title
    const needsScreenshot = state.linkPreviewEnabled && !hasPreviewImage;
    const apiUrl = needsScreenshot
        ? `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true`
        : `https://api.microlink.io/?url=${encodeURIComponent(url)}`;

    // Add timeout for fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    fetch(apiUrl, { signal: controller.signal })
        .then(response => response.json())
        .then(data => {
            clearTimeout(timeoutId);
            // Check if element is still in DOM
            if (!el.isConnected) return;

            if (data.status === 'success' && data.data) {
                // Update title if still using default domain name
                const pageTitle = data.data.title;
                if (pageTitle && item.content.title === domain) {
                    item.content.title = pageTitle;
                    const titleEl = el.querySelector('.link-title');
                    if (titleEl && !titleEl.classList.contains('editing')) {
                        titleEl.textContent = pageTitle;
                    }
                    eventBus.emit(Events.AUTOSAVE_TRIGGER);
                }

                // Handle screenshot preview
                if (state.linkPreviewEnabled && data.data.screenshot?.url && !hasPreviewImage) {
                    const screenshotUrl = data.data.screenshot.url;

                    // Validate the image before adding it
                    const previewImg = document.createElement('img');
                    previewImg.className = 'link-preview-img';
                    previewImg.alt = 'Link preview';

                    // Validate image loads and has reasonable dimensions
                    previewImg.onload = () => {
                        // Check if element is still in DOM and preview mode still enabled
                        if (!el.isConnected || !state.linkPreviewEnabled) {
                            return;
                        }
                        // Check for minimum dimensions to filter out broken/tiny images
                        if (previewImg.naturalWidth < 100 || previewImg.naturalHeight < 50) {
                            return;
                        }
                        // Double-check that no preview image was added while loading (prevents duplicates)
                        if (itemLink.querySelector('.link-preview-img')) {
                            return;
                        }
                        // Append preview at the end (below title and URL)
                        itemLink.appendChild(previewImg);
                        // Adjust item height for 3:2 aspect ratio preview (width ~228px inside padding, height ~152px)
                        if (!item.manuallyResized) {
                            item.h = Math.max(item.h, 280);
                            el.style.height = item.h + 'px';
                        }
                    };

                    previewImg.onerror = () => {
                        // Silently fail - image couldn't load
                    };

                    // Start loading the image
                    previewImg.src = screenshotUrl;
                }
            }
        })
        .catch(() => {
            clearTimeout(timeoutId);
            // Silently fail - preview not available
        });
}

// Fetch link metadata (title) for newly created links, regardless of preview setting
export function fetchLinkMetadata(item) {
    if (item.type !== 'link') return;
    // Always load preview/metadata for new links
    loadLinkPreviewForItem(item);
}

export function removeLinkPreviewFromItem(item) {
    if (item.type !== 'link') return;

    const el = item.el;
    const previewImg = el.querySelector('.link-preview-img');
    if (previewImg) {
        previewImg.remove();
        // Reset height if not manually resized
        if (!item.manuallyResized) {
            item.h = 116;
            el.style.height = item.h + 'px';
        }
    }
}

// Get best favicon URL for a hostname with fallback chain
function getFaviconUrl(hostname, size = 64) {
    // Use Google's favicon service as primary source
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`;
}

// Alternative favicon sources to try if primary fails
const FAVICON_FALLBACK_SOURCES = [
    (hostname) => `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
    (hostname) => `https://${hostname}/favicon.ico`
];

// Setup enhanced favicon error handler with fallback chain
function setupEnhancedFaviconHandler(imgElement, hostname) {
    let fallbackIndex = 0;

    imgElement.onerror = () => {
        if (fallbackIndex < FAVICON_FALLBACK_SOURCES.length) {
            // Try next fallback source
            imgElement.src = FAVICON_FALLBACK_SOURCES[fallbackIndex](hostname);
            fallbackIndex++;
        } else {
            // All sources failed, use SVG fallback
            imgElement.onerror = null;
            imgElement.src = FALLBACK_FAVICON;
        }
    };
}

// ============ Global Event Delegation for Memo Toolbars ============
// Single document-level listener instead of per-item listeners (prevents memory leaks)
let memoToolbarDelegationInitialized = false;

function initMemoToolbarDelegation() {
    if (memoToolbarDelegationInitialized) return;
    memoToolbarDelegationInitialized = true;

    document.addEventListener('mousedown', e => {
        // Hide all active memo toolbars when clicking outside
        document.querySelectorAll('.memo-toolbar.active').forEach(toolbar => {
            const memoBody = toolbar.closest('.canvas-item')?.querySelector('.memo-body');
            if (memoBody && !toolbar.contains(e.target) && !memoBody.contains(e.target)) {
                toolbar.classList.remove('active');
            }
        });
    });
}

// ============ Content Parser (HTML-only, with legacy markdown migration) ============

// Check if content is legacy markdown (no HTML tags)
function isLegacyMarkdown(text) {
    if (!text) return false;
    // If it contains HTML tags, it's already HTML
    if (/<[a-z][\s\S]*>/i.test(text)) return false;
    // If it has markdown patterns, it's legacy markdown
    return /^#{1,3} |^\d+\. |^- |\*\*|\*[^*]+\*|~~|__|\n/.test(text);
}

// Convert legacy markdown to HTML (for migration only)
function migrateLegacyMarkdown(text) {
    if (!text) return '';
    let html = esc(text);

    // Headings: # ## ###
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rule: ---
    html = html.replace(/^---$/gm, '<hr>');

    // Blockquote: > text
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic: *text*
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

    // Strikethrough: ~~text~~
    html = html.replace(/~~(.+?)~~/g, '<strike>$1</strike>');

    // Underline: __text__
    html = html.replace(/__(.+?)__/g, '<u>$1</u>');

    // Unordered list: - item
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered list: 1. item
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Line breaks
    html = html.replace(/(<\/(h1|h2|h3|blockquote)>|<hr>)\n/g, '$1');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/<\/blockquote><br><blockquote>/g, '</blockquote><blockquote>');
    html = html.replace(/^(<br>)+/, '');

    return html;
}

// Parse content - migrate legacy markdown or return HTML as-is
function parseContent(content) {
    if (!content) return '';
    if (isLegacyMarkdown(content)) {
        return migrateLegacyMarkdown(content);
    }
    return content; // Already HTML, return as-is
}

// Get HTML content from contenteditable element (direct storage, no conversion)
function getHtmlContent(el) {
    return el.innerHTML;
}

// Note: External function calls are now handled via eventBus
// Events emitted: STATE_SAVE, AUTOSAVE_TRIGGER, CONNECTIONS_UPDATE_ALL,
// CONNECTIONS_UPDATE, CONNECTIONS_DELETE, UI_SHOW_CHILD_TYPE_PICKER,
// CONNECTIONS_START, CONNECTIONS_COMPLETE, UI_SHOW_CONTEXT_MENU

// ============ Media Reload (for broken blob URLs) ============

// Reload media from storage when blob URL becomes invalid (e.g., after hard refresh)
async function reloadMediaSource(mediaElement, mediaId, retryCount = 0) {
    const MAX_RETRIES = 2;

    if (retryCount >= MAX_RETRIES) {
        console.warn(`Failed to reload media after ${MAX_RETRIES} attempts:`, mediaId);
        mediaElement.closest('.canvas-item')?.classList.add('media-load-failed');
        // Clean up invalid blob URL from cache to prevent memory leak
        const cachedUrl = state.blobURLCache.get(mediaId);
        if (cachedUrl) {
            URL.revokeObjectURL(cachedUrl);
            state.blobURLCache.delete(mediaId);
        }
        return false;
    }

    try {
        // Try file system first, then IndexedDB
        let blob = null;
        if (fsDirectoryHandle) {
            blob = await loadMediaFromFileSystem(mediaId);
        }
        if (!blob) {
            blob = await loadMedia(mediaId);
        }

        if (blob) {
            // Revoke old URL if exists
            const oldUrl = state.blobURLCache.get(mediaId);
            if (oldUrl) {
                URL.revokeObjectURL(oldUrl);
            }

            // Create new blob URL and update cache
            const newUrl = URL.createObjectURL(blob);
            state.blobURLCache.set(mediaId, newUrl);

            // Update media element source
            mediaElement.src = newUrl;
            mediaElement.closest('.canvas-item')?.classList.remove('media-load-failed');
            return true;
        }
    } catch (e) {
        console.error('Error reloading media:', e);
    }

    // Retry with exponential backoff
    await new Promise(r => setTimeout(r, 100 * Math.pow(2, retryCount)));
    return reloadMediaSource(mediaElement, mediaId, retryCount + 1);
}

// Setup error handler for media elements to auto-reload on failure
function setupMediaErrorHandler(mediaElement, mediaId) {
    if (!mediaId || !mediaId.startsWith('media_')) return;

    // Track if we're already attempting to reload
    let isReloading = false;

    const handleError = async () => {
        if (isReloading) return;
        isReloading = true;

        const itemEl = mediaElement.closest('.canvas-item');
        itemEl?.classList.add('media-loading');

        const success = await reloadMediaSource(mediaElement, mediaId);

        itemEl?.classList.remove('media-loading');
        isReloading = false;

        if (!success) {
            console.warn('Media reload failed for:', mediaId);
        }
    };

    // Store handler reference for cleanup to prevent memory leaks
    mediaElement._errorHandler = handleError;
    mediaElement.addEventListener('error', handleError);

    // Also handle case where src is empty (blob URL wasn't cached)
    if (!mediaElement.src || mediaElement.src === window.location.href) {
        handleError();
    }
}

/**
 * Create an item on the canvas
 * @param {Object} cfg - Item configuration
 * @param {string} cfg.type - Item type: 'memo' | 'keyword' | 'link' | 'image' | 'video'
 * @param {number} cfg.x - X position on canvas
 * @param {number} cfg.y - Y position on canvas
 * @param {number} cfg.w - Width in pixels
 * @param {number} cfg.h - Height in pixels
 * @param {string|Object} [cfg.content] - Content (string for memo/keyword, object for link, mediaId for image/video)
 * @param {string} [cfg.color] - Color name from COLOR_MAP
 * @param {string} [cfg.fontSize] - Font size: null | 'medium' | 'large' | 'xlarge'
 * @param {string} [cfg.textAlign] - Text alignment: null | 'center' | 'right'
 * @param {number} [cfg.z] - Z-index (only used when loading)
 * @param {boolean} [loading=false] - True when loading from storage (skips animations)
 * @returns {Object} Created item object with el, type, x, y, w, h, content, etc.
 */
export function createItem(cfg, loading = false) {
    const el = document.createElement('div');
    el.className = 'canvas-item' + (loading ? '' : ' new');
    el.dataset.itemType = cfg.type;
    // When loading, use saved z-index if available; otherwise get new highest z-index
    const zIndex = (loading && cfg.z !== undefined) ? cfg.z : state.incrementHighestZ();
    el.style.cssText = `left:${cfg.x}px;top:${cfg.y}px;width:${cfg.w}px;height:${cfg.h}px;z-index:${zIndex}`;

    let html = '';
    let mediaSrc = '';

    if ((cfg.type === 'image' || cfg.type === 'video') && cfg.content) {
        mediaSrc = cfg.content.startsWith('media_') ? (state.blobURLCache.get(cfg.content) || '') : cfg.content;
    }

    switch (cfg.type) {
        case 'image':
            html = `<img class="item-image" src="${mediaSrc}">`;
            break;
        case 'video':
            html = `<div class="video-container">
                <video class="item-video" src="${mediaSrc}"></video>
                <div class="video-controls">
                    <button class="video-play-btn" title="Play/Pause">
                        <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        <svg class="pause-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                    </button>
                    <div class="video-progress-container">
                        <div class="video-progress">
                            <div class="video-progress-filled"></div>
                        </div>
                    </div>
                    <span class="video-time">0:00</span>
                    <button class="video-mute-btn" title="Mute/Unmute">
                        <svg class="volume-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                        <svg class="muted-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                    </button>
                    <button class="video-fullscreen-btn" title="Fullscreen">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                    </button>
                </div>
            </div>`;
            break;
        case 'memo':
            html = `<div class="item-memo"><div class="memo-body" contenteditable="true" spellcheck="false" data-placeholder="Write something...">${parseContent(cfg.content || '')}</div></div>`;
            break;
        case 'keyword':
            html = `<div class="item-keyword"><div class="keyword-body" contenteditable="true" spellcheck="false" data-placeholder="Keyword">${esc(cfg.content || '')}</div></div>`;
            break;
        case 'link': {
            const linkContent = cfg.content || {};
            const linkUrl = linkContent.url || '';
            const linkTitle = linkContent.title || 'Untitled Link';
            const linkDisplay = linkContent.display || linkUrl || 'No URL';
            let hostname = '';
            try {
                hostname = new URL(linkUrl).hostname;
            } catch {
                hostname = '';
            }
            html = `<div class="item-link"><img class="link-favicon" src="https://www.google.com/s2/favicons?domain=${hostname}&sz=64"><div class="link-title">${esc(linkTitle)}</div><a class="link-url" href="${esc(linkUrl)}" target="_blank">${esc(linkDisplay)}</a></div>`;
            break;
        }
    }

    if (cfg.color) {
        el.style.setProperty('--tag-color', COLOR_MAP[cfg.color]);
        el.classList.add('has-color');
        el.dataset.color = cfg.color;
    }

    if (cfg.fontSize && cfg.type === 'memo') {
        el.classList.add('font-size-' + cfg.fontSize);
    }

    if (cfg.textAlign && cfg.type === 'memo') {
        el.classList.add('text-align-' + cfg.textAlign);
    }

    const isMemo = cfg.type === 'memo';
    const isKeyword = cfg.type === 'keyword';
    const fontSizeBtn = isMemo
        ? `<button class="font-size-btn" title="Font Size"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg></button>`
        : '';
    const memoToolbar = isMemo
        ? `<div class="memo-toolbar"><button class="md-btn" data-md="heading" title="Heading"><svg width="14" height="17" viewBox="0 0 27 34" fill="currentColor"><path d="M2.07 33.82c-1.26 0-2.07-.83-2.07-2.14V2.14C0 .83.8 0 2.07 0c1.26 0 2.07.83 2.07 2.14v12.53h18.2V2.14c0-1.31.81-2.14 2.07-2.14 1.27 0 2.07.83 2.07 2.14v29.54c0 1.31-.8 2.14-2.07 2.14-1.26 0-2.07-.83-2.07-2.14V18.39H4.14v13.29c0 1.31-.81 2.14-2.07 2.14z"/></svg></button><button class="md-btn" data-md="bold" title="Bold"><svg width="13" height="17" viewBox="0 0 25 33" fill="currentColor"><path d="M2.9 32.49C1.1 32.49 0 31.37 0 29.48V3.02C0 1.13 1.1 0 2.9 0h10.59c5.9 0 9.7 3.18 9.7 8.11 0 3.49-2.59 6.53-5.92 7.07v.18c4.41.43 7.5 3.6 7.5 7.9 0 5.72-4.21 9.23-11.15 9.23H2.9zM5.81 13.69h5.31c4.05 0 6.33-1.71 6.33-4.73 0-2.84-1.96-4.44-5.43-4.44H5.81v9.17zm0 14.28h6.49c4.28 0 6.55-1.78 6.55-5.11 0-3.31-2.34-5.05-6.8-5.05H5.81v10.16z"/></svg></button><button class="md-btn" data-md="italic" title="Italic"><svg width="13" height="17" viewBox="0 0 25 34" fill="currentColor"><path d="M1.85156 33.8203C0.75 33.8203 0 33.0703 0 32.0156C0 30.9609 0.75 30.2109 1.85156 30.2109H6.75L13.75 3.60938H8.85156C7.75 3.60938 7 2.85938 7 1.80469C7 0.75 7.75 0 8.85156 0H22.7734C23.8984 0 24.7188 0.703125 24.7188 1.80469C24.7188 2.90625 23.8984 3.60938 22.7734 3.60938H17.9688L10.9688 30.2109H15.7734C16.8984 30.2109 17.7188 30.9141 17.7188 32.0156C17.7188 33.1172 16.8984 33.8203 15.7734 33.8203H1.85156Z"/></svg></button><button class="md-btn" data-md="strike" title="Strikethrough"><svg width="18" height="18" viewBox="0 0 35 35" fill="currentColor"><path d="M17.5 0c5.65 0 10.2 2.84 11.42 7.41.07.26.12.61.12 1.05 0 1.15-.8 1.9-1.92 1.9-1.08 0-1.74-.56-2.11-1.64-1.17-3.42-3.96-4.92-7.62-4.92-4.22 0-7.48 2.06-7.48 5.51 0 2.67 1.81 4.5 6.42 5.51l3.75.82c.13.03.26.06.39.09h12.76a1.75 1.75 0 110 3.5h-5.35c1.41 1.46 2.07 3.28 2.07 5.55 0 6.26-4.92 10.17-12.5 10.17-6.35 0-10.87-2.86-12.14-6.94-.14-.47-.23-.98-.23-1.48 0-1.34.75-2.18 1.95-2.18 1.05 0 1.71.54 2.04 1.67 1.03 3.49 4.36 5.13 8.62 5.13 4.59 0 7.92-2.41 7.92-5.74 0-2.84-1.87-4.71-6.56-5.74l-2.02-.44H1.75a1.75 1.75 0 110-3.5h6.47c-1.81-1.6-2.64-3.67-2.64-6.23 0-5.58 4.92-9.49 12.01-9.49z"/></svg></button><button class="md-btn" data-md="underline" title="Underline"><svg width="16" height="19" viewBox="0 0 31 36" fill="currentColor"><path d="M15.18 30.71C6.79 30.71 1.75 25.51 1.75 18.29V2.18C1.75.84 2.57 0 3.86 0s2.11.84 2.11 2.18v15.83c0 5.11 3.35 8.81 9.21 8.81s9.21-3.7 9.21-8.81V2.18C24.39.84 25.21 0 26.5 0s2.11.84 2.11 2.18v16.11c0 7.22-5.04 12.42-13.43 12.42z"/><path d="M28.61 32.4a1.75 1.75 0 110 3.5H1.75a1.75 1.75 0 110-3.5h26.86z"/></svg></button><span class="toolbar-sep"></span><button class="md-btn" data-md="align-left" title="Align Left"><svg width="17" height="15" viewBox="0 0 35 31" fill="currentColor"><path d="M32.5713 0C33.5665 9.57883e-05 34.3734 0.807064 34.3735 1.80228C34.3735 2.79759 33.5665 3.60446 32.5713 3.60455H1.80228C0.806907 3.60455 0 2.79765 0 1.80228C0.00011508 0.807005 0.806978 0 1.80228 0H32.5713Z"/><path d="M32.5713 18.2628C33.5665 18.2629 34.3734 19.0699 34.3735 20.0651C34.3735 21.0604 33.5665 21.8673 32.5713 21.8674H1.80228C0.806907 21.8674 0 21.0605 0 20.0651C0.00011508 19.0698 0.806978 18.2628 1.80228 18.2628H32.5713Z"/><path d="M20.5713 27.3942C21.5665 27.3943 22.3734 28.2012 22.3735 29.1964C22.3735 30.1918 21.5665 30.9986 20.5713 30.9987H1.80228C0.806907 30.9987 0 30.1918 0 29.1964C0.00011508 28.2012 0.806978 27.3942 1.80228 27.3942H20.5713Z"/><path d="M24.5713 9.13141C25.5665 9.1315 26.3734 9.93847 26.3735 10.9337C26.3735 11.929 25.5665 12.7359 24.5713 12.736H1.80228C0.806907 12.736 0 11.9291 0 10.9337C0.00011508 9.93841 0.806978 9.13141 1.80228 9.13141H24.5713Z"/></svg></button><button class="md-btn" data-md="align-center" title="Align Center"><svg width="17" height="15" viewBox="0 0 35 31" fill="currentColor"><path d="M32.5713 0C33.5665 9.57883e-05 34.3734 0.807064 34.3735 1.80228C34.3735 2.79759 33.5665 3.60446 32.5713 3.60455H1.80228C0.806907 3.60455 0 2.79765 0 1.80228C0.00011508 0.807005 0.806978 0 1.80228 0H32.5713Z"/><path d="M32.5713 18.2628C33.5665 18.2629 34.3734 19.0699 34.3735 20.0651C34.3735 21.0604 33.5665 21.8673 32.5713 21.8674H1.80228C0.806907 21.8674 0 21.0605 0 20.0651C0.00011508 19.0698 0.806978 18.2628 1.80228 18.2628H32.5713Z"/><path d="M26.5713 27.3942C27.5665 27.3943 28.3734 28.2012 28.3735 29.1964C28.3735 30.1918 27.5665 30.9986 26.5713 30.9987H7.80228C6.80691 30.9987 6 30.1918 6 29.1964C6.00012 28.2012 6.80698 27.3942 7.80228 27.3942H26.5713Z"/><path d="M28.5713 9.13141C29.5665 9.1315 30.3734 9.93847 30.3735 10.9337C30.3735 11.929 29.5665 12.7359 28.5713 12.736H5.80228C4.80691 12.736 4 11.9291 4 10.9337C4.00012 9.93841 4.80698 9.13141 5.80228 9.13141H28.5713Z"/></svg></button><button class="md-btn" data-md="align-right" title="Align Right"><svg width="17" height="15" viewBox="0 0 35 31" fill="currentColor"><path d="M32.5713 0C33.5665 9.57883e-05 34.3734 0.807064 34.3735 1.80228C34.3735 2.79759 33.5665 3.60446 32.5713 3.60455H1.80228C0.806907 3.60455 0 2.79765 0 1.80228C0.00011508 0.807005 0.806978 0 1.80228 0H32.5713Z"/><path d="M32.5713 18.2628C33.5665 18.2629 34.3734 19.0699 34.3735 20.0651C34.3735 21.0604 33.5665 21.8673 32.5713 21.8674H1.80228C0.806907 21.8674 0 21.0605 0 20.0651C0.00011508 19.0698 0.806978 18.2628 1.80228 18.2628H32.5713Z"/><path d="M32.5713 27.3942C33.5665 27.3943 34.3734 28.2012 34.3735 29.1964C34.3735 30.1918 33.5665 30.9986 32.5713 30.9987H13.8023C12.8069 30.9987 12 30.1918 12 29.1964C12.0001 28.2012 12.807 27.3942 13.8023 27.3942H32.5713Z"/><path d="M32.5713 9.13141C33.5665 9.1315 34.3734 9.93847 34.3735 10.9337C34.3735 11.929 33.5665 12.7359 32.5713 12.736H9.80228C8.80691 12.736 8 11.9291 8 10.9337C8.00012 9.93841 8.80698 9.13141 9.80228 9.13141H32.5713Z"/></svg></button></div>`
        : '';

    if (!isMemo && !isKeyword) {
        el.classList.add('no-font-btn');
    }
    if (isKeyword) {
        el.classList.add('keyword-node');
    }

    el.innerHTML = `<div class="color-dot"></div><div class="item-content">${html}</div><button class="delete-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>${fontSizeBtn}<button class="color-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="7.5" r="2" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12.5" r="2" fill="currentColor" stroke="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"/></svg></button><div class="color-picker"><div class="color-opt none" data-color="" title="None"></div>${COLORS.map(c => `<div class="color-opt" data-color="${c}" style="background:${COLOR_MAP[c]}" title="${c}"></div>`).join('')}</div><div class="resize-handle"></div><div class="connection-handle top" data-h="top"></div><div class="connection-handle bottom" data-h="bottom"></div><div class="connection-handle left" data-h="left"></div><div class="connection-handle right" data-h="right"></div><button class="add-child-btn top" data-d="top">+</button><button class="add-child-btn bottom" data-d="bottom">+</button><button class="add-child-btn left" data-d="left">+</button><button class="add-child-btn right" data-d="right">+</button>${memoToolbar}`;

    canvas.appendChild(el);

    // Setup media error handlers for auto-reload on broken blob URLs
    if (cfg.type === 'image' && cfg.content?.startsWith('media_')) {
        const imgEl = el.querySelector('.item-image');
        if (imgEl) setupMediaErrorHandler(imgEl, cfg.content);
    } else if (cfg.type === 'video' && cfg.content?.startsWith('media_')) {
        const videoEl = el.querySelector('.item-video');
        if (videoEl) setupMediaErrorHandler(videoEl, cfg.content);
    } else if (cfg.type === 'link') {
        // Setup enhanced favicon fallback for link items
        const faviconEl = el.querySelector('.link-favicon');
        if (faviconEl) {
            const linkContent = cfg.content || {};
            const linkUrl = linkContent.url || '';
            let hostname = '';
            try {
                hostname = new URL(linkUrl).hostname;
            } catch {
                hostname = '';
            }
            if (hostname) {
                setupEnhancedFaviconHandler(faviconEl, hostname);
            } else {
                setupFaviconErrorHandler(faviconEl);
            }
        }
    }

    const item = {
        id: cfg.id || `i${state.incrementItemId()}`,
        el,
        type: cfg.type,
        x: cfg.x,
        y: cfg.y,
        w: cfg.w,
        h: cfg.h,
        content: cfg.content,
        color: cfg.color || null,
        fontSize: cfg.fontSize || null,
        textAlign: cfg.textAlign || null,
        locked: cfg.locked || false,
        manuallyResized: cfg.manuallyResized || false
    };

    state.items.push(item);
    setupItemEvents(item);

    if (!loading) {
        throttledMinimap();
        if (state.activeFilter !== 'all') {
            if (state.activeFilter === 'none') {
                if (item.color !== null) {
                    item.el.classList.add('filtered-out');
                }
            } else if (item.color !== state.activeFilter) {
                item.el.classList.add('filtered-out');
            }
        }
        // If color group mode is active, position the new item in the appropriate color group
        if (state.colorGroupModeActive) {
            positionNewItemInColorGroup(item);
        }
    }

    setTimeout(() => el.classList.remove('new'), 200);

    // Load link preview if enabled and this is a link item
    if (item.type === 'link' && state.linkPreviewEnabled && !loading) {
        loadLinkPreviewForItem(item);
    }

    return item;
}

// ============ Item Event Handler Helpers ============
// These functions are extracted from setupItemEvents for better organization

/**
 * Setup common events for all item types (drag, resize, delete, color, etc.)
 */
function setupItemCommonEvents(item, el, signal) {
    el.addEventListener('mousedown', e => {
        const t = e.target;
        const isContentEditable = t.closest('[contenteditable="true"]') || t.classList.contains('memo-body');

        // Always bring item to top when clicking anywhere on it (including memo-body)
        el.style.zIndex = state.incrementHighestZ();

        // Skip drag for interactive elements
        if (t.classList.contains('delete-btn') || t.classList.contains('resize-handle') ||
            t.classList.contains('connection-handle') || t.classList.contains('add-child-btn') ||
            t.classList.contains('color-btn') || t.classList.contains('font-size-btn') ||
            t.classList.contains('color-opt') || t.closest('.color-picker') ||
            t.closest('.video-controls') || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
            return;
        }
        // Skip drag for contenteditable, but allow Alt+drag for duplication
        if (isContentEditable && !e.altKey) {
            return;
        }
        if (item.locked) return;

        e.stopPropagation();

        // Alt + drag to duplicate item
        if (e.altKey) {
            const duplicated = duplicateItemForDrag(item);
            selectItem(duplicated, false);
            const rect = duplicated.el.getBoundingClientRect();
            duplicated.ox = (e.clientX - rect.left) / state.scale;
            duplicated.oy = (e.clientY - rect.top) / state.scale;
            state.setDraggedItem(duplicated);
            duplicated.el.classList.add('dragging');
            canvas.classList.add('dragging-item');
            document.body.classList.add('is-dragging');
            return;
        }

        if (!state.selectedItems.has(item) && !e.shiftKey) {
            selectItem(item, false);
        } else if (e.shiftKey) {
            if (state.selectedItems.has(item)) state.selectedItems.delete(item);
            else state.selectedItems.add(item);
            item.el.classList.toggle('selected');
        } else {
            selectItem(item, true);
        }

        const rect = el.getBoundingClientRect();
        item.ox = (e.clientX - rect.left) / state.scale;
        item.oy = (e.clientY - rect.top) / state.scale;
        state.setDraggedItem(item);
        state.selectedItems.forEach(i => i.el.classList.add('dragging'));
        canvas.classList.add('dragging-item');
        document.body.classList.add('is-dragging');
    }, { signal });

    el.querySelector('.resize-handle').addEventListener('mousedown', e => {
        if (item.locked) return;
        // Bring item to top before stopPropagation
        el.style.zIndex = state.incrementHighestZ();
        e.stopPropagation();
        // Store initial aspect ratio for proportional resize (Shift key)
        item.initialAspectRatio = item.w / item.h;
        state.setResizingItem(item);
        // Prevent text selection during resize
        document.body.classList.add('is-dragging');
    }, { signal });

    el.querySelector('.delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (state.selectedItems.has(item)) deleteSelectedItems();
        else deleteItem(item);
    }, { signal });

    const colorBtnEl = el.querySelector('.color-btn');
    const colorPicker = el.querySelector('.color-picker');

    colorBtnEl.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.color-picker.active').forEach(p => {
            if (p !== colorPicker) p.classList.remove('active');
        });
        colorPicker.classList.toggle('active');
        colorPicker.querySelectorAll('.color-opt').forEach(o =>
            o.classList.toggle('selected', o.dataset.color === (item.color || ''))
        );
    }, { signal });

    colorPicker.querySelectorAll('.color-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            setItemColor(item, opt.dataset.color || null);
            colorPicker.classList.remove('active');
        }, { signal });
    });

    const fontSizeBtn = el.querySelector('.font-size-btn');
    if (fontSizeBtn) {
        fontSizeBtn.addEventListener('click', e => {
            e.stopPropagation();
            setItemFontSize(item);
        }, { signal });
    }

    el.querySelectorAll('.add-child-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            eventBus.emit(Events.UI_SHOW_CHILD_TYPE_PICKER, item, btn.dataset.d, e);
        }, { signal });
    });

    el.querySelectorAll('.connection-handle').forEach(h => {
        h.addEventListener('mousedown', e => {
            // Bring item to top before stopPropagation
            el.style.zIndex = state.incrementHighestZ();
            e.stopPropagation();
            if (state.connectSource) {
                eventBus.emit(Events.CONNECTIONS_COMPLETE, item, h.dataset.h);
            } else {
                eventBus.emit(Events.CONNECTIONS_START, item, h.dataset.h);
            }
        }, { signal });
        h.addEventListener('mouseenter', () => {
            if (state.connectSource && state.connectSource !== item) {
                el.classList.add('connect-target');
            }
        }, { signal });
        h.addEventListener('mouseleave', () => el.classList.remove('connect-target'), { signal });
    });

    el.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();

        // In connecting mode, right-click cancels the connection
        if (state.connectSource) {
            eventBus.emit(Events.CONNECTIONS_CANCEL, true); // with fade effect
            return;
        }

        if (!state.selectedItems.has(item)) selectItem(item);
        eventBus.emit(Events.UI_SHOW_CONTEXT_MENU, e.clientX, e.clientY, item);
    }, { signal });
}

/**
 * Setup memo-specific events (text editing, toolbar, selection, etc.)
 */
function setupMemoEvents(item, el, signal) {
    const itemMemo = el.querySelector('.item-memo');
    const mb = el.querySelector('.memo-body');
    const toolbar = el.querySelector('.memo-toolbar');

    // Track content before editing for undo
    let contentBeforeEdit = item.content;
    let hasUnsavedChanges = false;
    let undoSaveTimer = null;

    // Handle border/padding area click - select node instead of focusing text
    itemMemo.addEventListener('mousedown', e => {
            // Only handle left mouse button
            if (e.button !== 0) return;

            // Use fixed border zone from canvas-item edges for consistent drag area
            // This ensures edges are always draggable regardless of scrollbar or content
            const EDGE_ZONE = 10; // pixels from each edge that are always draggable
            const itemRect = el.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;

            // Check if click is within the edge zone (fixed pixel border from item edges)
            const isInPaddingArea = x < itemRect.left + EDGE_ZONE ||
                                    x > itemRect.right - EDGE_ZONE ||
                                    y < itemRect.top + EDGE_ZONE ||
                                    y > itemRect.bottom - EDGE_ZONE;

            if (isInPaddingArea) {
                e.preventDefault();  // Prevent text focus

                // Allow event to bubble up for Alt+drag duplication
                if (e.altKey) {
                    return;
                }

                e.stopPropagation();

                // Bring item to top
                el.style.zIndex = state.incrementHighestZ();

                // Handle selection
                if (e.shiftKey) {
                    if (state.selectedItems.has(item)) {
                        state.selectedItems.delete(item);
                        item.el.classList.remove('selected');
                    } else {
                        state.selectedItems.add(item);
                        item.el.classList.add('selected');
                    }
                } else if (!state.selectedItems.has(item)) {
                    // Only deselect others if this item wasn't already selected
                    selectItem(item, false);
                } else {
                    // Item already selected - update selected item for context menu
                    state.setSelectedItem(item);
                }

                // Setup drag if not locked
                if (!item.locked) {
                    const rect = el.getBoundingClientRect();
                    item.ox = (e.clientX - rect.left) / state.scale;
                    item.oy = (e.clientY - rect.top) / state.scale;
                    state.setDraggedItem(item);
                    state.selectedItems.forEach(i => i.el.classList.add('dragging'));
                    canvas.classList.add('dragging-item');
                    document.body.classList.add('is-dragging');
                }
            }
        }, { signal });

        // Handle text selection drag outside memo area
        mb.addEventListener('mousedown', e => {
            // Only for left mouse button and when in text editing mode
            if (e.button === 0 && (e.target === mb || mb.contains(e.target))) {
                state.setIsSelectingText(true);

                const handleMouseUp = () => {
                    state.setIsSelectingText(false);
                    window.removeEventListener('mouseup', handleMouseUp);
                    window.removeEventListener('mousemove', handleMouseMove);
                };

                const handleMouseMove = e => {
                    if (state.isSelectingText) {
                        // Extend selection even outside memo area
                        e.stopPropagation();
                    }
                };

                window.addEventListener('mouseup', handleMouseUp);
                window.addEventListener('mousemove', handleMouseMove);
            }
        }, { signal });

        // Handle input - save content
        mb.addEventListener('input', () => {
            item.content = getHtmlContent(mb);
            eventBus.emit(Events.AUTOSAVE_TRIGGER);
            hasUnsavedChanges = true;

            // Debounced save to undo stack (save after 1 second of no typing)
            if (undoSaveTimer) clearTimeout(undoSaveTimer);
            undoSaveTimer = setTimeout(() => {
                if (hasUnsavedChanges && item.content !== contentBeforeEdit) {
                    eventBus.emit(Events.STATE_SAVE);
                    contentBeforeEdit = item.content;
                    hasUnsavedChanges = false;
                }
            }, 1000);
        }, { signal });

        // Handle blur - save state if changed
        mb.addEventListener('blur', () => {
            el.classList.remove('editing');
            // Hide toolbar after a short delay (allows clicking toolbar buttons)
            setTimeout(() => {
                const sel = window.getSelection();
                if (!sel.rangeCount || sel.isCollapsed || !mb.contains(sel.anchorNode)) {
                    toolbar.classList.remove('active');
                }
            }, 150);
            // Clear pending debounce timer
            if (undoSaveTimer) {
                clearTimeout(undoSaveTimer);
                undoSaveTimer = null;
            }
            // Save to undo stack if content changed during editing
            if (hasUnsavedChanges && item.content !== contentBeforeEdit) {
                eventBus.emit(Events.STATE_SAVE);
                contentBeforeEdit = item.content;
                hasUnsavedChanges = false;
            }
        }, { signal });

        // Record current state for undo on focus
        mb.addEventListener('focus', () => {
            el.classList.add('editing');
            // Record content before editing starts
            contentBeforeEdit = item.content;
            hasUnsavedChanges = false;
        }, { signal });

        // Function to show toolbar near selection
        function showToolbarNearSelection() {
            const sel = window.getSelection();
            if (!sel.rangeCount || sel.isCollapsed) {
                toolbar.classList.remove('active');
                return;
            }

            // Check if selection is within this memo
            // anchorNode or focusNode could be null in edge cases
            if (!sel.anchorNode || !sel.focusNode ||
                !mb.contains(sel.anchorNode) || !mb.contains(sel.focusNode)) {
                toolbar.classList.remove('active');
                return;
            }

            const range = sel.getRangeAt(0);
            let rect = range.getBoundingClientRect();

            // Handle edge case where rect is empty (e.g., empty lines selected)
            if (rect.width === 0 && rect.height === 0) {
                // Try to get rect from the anchor node's parent element
                const parentEl = sel.anchorNode.parentElement;
                if (parentEl) {
                    const parentRect = parentEl.getBoundingClientRect();
                    if (parentRect.width > 0 || parentRect.height > 0) {
                        rect = parentRect;
                    }
                }
                // If still empty, use the memo body rect as fallback
                if (rect.width === 0 && rect.height === 0) {
                    rect = mb.getBoundingClientRect();
                }
            }

            // Position toolbar above the selection
            // Measure actual toolbar height by temporarily showing it offscreen
            toolbar.style.left = '-9999px';
            toolbar.style.top = '-9999px';
            toolbar.classList.add('active');
            const toolbarHeight = toolbar.offsetHeight || 40;

            const toolbarWidth = 180; // Approximate toolbar width
            let left = rect.left + (rect.width / 3) - (toolbarWidth / 3);
            let top = rect.top - toolbarHeight - 28;

            // Keep toolbar within viewport
            if (left < 8) left = 8;
            if (left + toolbarWidth > window.innerWidth - 8) {
                left = window.innerWidth - toolbarWidth - 8;
            }
            if (top < 8) {
                // If not enough space above, show below selection
                top = rect.bottom + 8;
            }

            // Convert viewport coordinates to canvas coordinates
            // Toolbar is inside transformed canvas, so position: fixed is relative to canvas
            left = (left - state.offsetX) / state.scale;
            top = (top - state.offsetY) / state.scale;

            toolbar.style.left = left + 'px';
            toolbar.style.top = top + 'px';
            toolbar.classList.add('active');
        }

        // Show toolbar on text selection
        mb.addEventListener('mouseup', () => {
            // Small delay to ensure selection is finalized
            setTimeout(showToolbarNearSelection, 10);
        }, { signal });

        // Handle double-click (word selection) and triple-click (paragraph selection)
        mb.addEventListener('dblclick', () => {
            setTimeout(showToolbarNearSelection, 10);
        }, { signal });

        // Handle all keyboard-based selections:
        // - Shift+Arrow keys
        // - Ctrl+A (select all)
        // - Ctrl+Shift+End/Home (select to end/beginning)
        // - Any other keyboard selection method
        mb.addEventListener('keyup', e => {
            // Check for any selection-related key combinations
            const isSelectionKey = e.shiftKey ||
                                   e.key === 'Shift' ||
                                   (e.ctrlKey && e.key.toLowerCase() === 'a') ||
                                   (e.metaKey && e.key.toLowerCase() === 'a'); // Mac support
            if (isSelectionKey) {
                setTimeout(showToolbarNearSelection, 10);
            }
        }, { signal });

        // Use selectionchange event to catch ALL selection methods
        // This covers: Ctrl+A, context menu "Select All", programmatic selection, etc.
        let selectionChangeTimeout = null;
        const handleSelectionChange = () => {
            // Debounce to avoid excessive calls
            if (selectionChangeTimeout) {
                clearTimeout(selectionChangeTimeout);
            }
            selectionChangeTimeout = setTimeout(() => {
                const sel = window.getSelection();
                // Only handle if selection is within this memo and memo is being edited
                // Check: selection exists, not collapsed, anchor is in this memo,
                // and either this memo has focus or is in editing mode
                const isEditingThisMemo = el.classList.contains('editing') ||
                                          document.activeElement === mb ||
                                          mb.contains(document.activeElement);
                if (sel && !sel.isCollapsed &&
                    sel.anchorNode && mb.contains(sel.anchorNode) &&
                    isEditingThisMemo) {
                    showToolbarNearSelection();
                }
            }, 10);
        };

        // Store selectionchange handler for cleanup on item deletion
        item._selectionChangeHandler = handleSelectionChange;

        // Add selectionchange listener when memo gets focus
        mb.addEventListener('focus', () => {
            document.addEventListener('selectionchange', handleSelectionChange);
        }, { signal });

        // Remove selectionchange listener when memo loses focus (cleanup)
        mb.addEventListener('blur', () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            if (selectionChangeTimeout) {
                clearTimeout(selectionChangeTimeout);
                selectionChangeTimeout = null;
            }
        }, { signal });

        // Initialize global event delegation for toolbar cleanup (once per module)
        // This replaces per-item document listeners to prevent memory leaks
        initMemoToolbarDelegation();

        // Block image paste in memo and only allow plain text
        mb.addEventListener('paste', e => {
            e.preventDefault();
            const cd = e.clipboardData;
            if (!cd) return;

            // Check if clipboard contains images - block them
            for (let i = 0; i < cd.items.length; i++) {
                if (cd.items[i].type.indexOf('image') !== -1) {
                    return;
                }
            }

            // Only allow plain text paste
            const text = cd.getData('text/plain');
            if (text) {
                document.execCommand('insertText', false, text);
            }
        }, { signal });

        // Auto list formatting on Enter key
        mb.addEventListener('keydown', e => {
            if (e.key !== 'Enter' || e.shiftKey) return;

            // Skip list continuation if we just cancelled a list
            if (mb._listCancelled) {
                delete mb._listCancelled;
                return; // Allow default Enter behavior
            }

            const sel = window.getSelection();
            if (!sel.rangeCount) return;

            // Get the current line text
            const range = sel.getRangeAt(0);
            let node = range.startContainer;

            // Find the line/block element
            let lineNode = node;
            while (lineNode && lineNode !== mb) {
                if (lineNode.nodeType === Node.ELEMENT_NODE) {
                    const tag = lineNode.tagName;
                    if (tag === 'DIV' || tag === 'P' || tag === 'LI' || tag === 'BR') {
                        break;
                    }
                }
                lineNode = lineNode.parentNode;
            }

            // Get text content of current line
            let lineText = '';
            if (node.nodeType === Node.TEXT_NODE) {
                // Get the full text of the line
                let textNode = node;
                while (textNode.previousSibling) {
                    if (textNode.previousSibling.nodeType === Node.TEXT_NODE) {
                        textNode = textNode.previousSibling;
                    } else if (textNode.previousSibling.tagName === 'BR') {
                        break;
                    } else {
                        textNode = textNode.previousSibling;
                    }
                }
                // Collect text from start of line to cursor
                let currentNode = textNode;
                while (currentNode) {
                    if (currentNode === node) {
                        lineText += node.textContent.substring(0, range.startOffset);
                        break;
                    } else if (currentNode.nodeType === Node.TEXT_NODE) {
                        lineText += currentNode.textContent;
                    } else if (currentNode.tagName === 'BR') {
                        lineText = '';
                    } else if (currentNode.textContent) {
                        lineText += currentNode.textContent;
                    }
                    currentNode = currentNode.nextSibling;
                }
            } else if (lineNode && lineNode !== mb) {
                lineText = lineNode.textContent;
            }

            // Check for list patterns
            // Ordered list: "1. ", "2. ", "10. ", etc.
            const orderedMatch = lineText.match(/^(\d+)\.\s/);
            // Unordered list: "- " or "* "
            const unorderedMatch = lineText.match(/^([-*])\s/);

            if (orderedMatch || unorderedMatch) {
                e.preventDefault();

                // Check if the line only contains the list marker (empty item)
                const isEmptyItem = orderedMatch
                    ? lineText.trim() === orderedMatch[1] + '.'
                    : lineText.trim() === unorderedMatch[1];

                if (isEmptyItem) {
                    // Double enter - remove the list marker and exit list mode
                    // Get the prefix length to delete
                    const prefixLen = orderedMatch
                        ? orderedMatch[0].length  // "1. " or "10. " etc.
                        : unorderedMatch[0].length;  // "- " or "* "

                    // Delete the prefix characters backwards using execCommand
                    // This keeps cursor position stable
                    for (let i = 0; i < prefixLen; i++) {
                        document.execCommand('delete', false, null);
                    }

                    // Set flag to prevent list from reappearing on next Enter
                    mb._listCancelled = true;
                } else {
                    // Continue the list
                    let prefix;
                    if (orderedMatch) {
                        // Increment the number for ordered list
                        const nextNum = parseInt(orderedMatch[1], 10) + 1;
                        prefix = nextNum + '. ';
                    } else {
                        // Use the same marker for unordered list
                        prefix = unorderedMatch[1] + ' ';
                    }

                    // Insert new line with prefix
                    document.execCommand('insertLineBreak', false, null);
                    document.execCommand('insertText', false, prefix);
                }

                // Trigger input event for saving
                mb.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, { signal });

        // Markdown toolbar buttons - simple toggle with execCommand
        toolbar.querySelectorAll('.md-btn').forEach(btn => {
            btn.addEventListener('mousedown', e => {
                e.preventDefault(); // Prevent blur
            }, { signal });
            btn.addEventListener('click', e => {
                e.stopPropagation();
                mb.focus();
                const md = btn.dataset.md;

                switch (md) {
                    case 'bold':
                        document.execCommand('bold', false, null);
                        break;
                    case 'italic':
                        document.execCommand('italic', false, null);
                        break;
                    case 'strike':
                        document.execCommand('strikeThrough', false, null);
                        break;
                    case 'underline':
                        document.execCommand('underline', false, null);
                        break;
                    case 'heading':
                        toggleHeading(mb);
                        break;
                    case 'align-left':
                        // Remove item-level text-align class so block-level styles take effect
                        el.classList.remove('text-align-center', 'text-align-right');
                        item.textAlign = null;
                        setAlignment(mb, 'left');
                        break;
                    case 'align-center':
                        el.classList.remove('text-align-center', 'text-align-right');
                        item.textAlign = null;
                        setAlignment(mb, 'center');
                        break;
                    case 'align-right':
                        el.classList.remove('text-align-center', 'text-align-right');
                        item.textAlign = null;
                        setAlignment(mb, 'right');
                        break;
                }

                item.content = getHtmlContent(mb);
                eventBus.emit(Events.AUTOSAVE_TRIGGER);
                hasUnsavedChanges = true;

                // Save to undo stack immediately for formatting changes
                if (item.content !== contentBeforeEdit) {
                    eventBus.emit(Events.STATE_SAVE);
                    contentBeforeEdit = item.content;
                    hasUnsavedChanges = false;
                }

                // Update toolbar position after formatting
                setTimeout(showToolbarNearSelection, 10);
            }, { signal });
        });
}

/**
 * Setup keyword-specific events (single-line editing, plain text only)
 */
function setupKeywordEvents(item, el, signal) {
    const kb = el.querySelector('.keyword-body');

        // Track content before editing for undo
        let contentBeforeEdit = item.content;
        let hasUnsavedChanges = false;
        let undoSaveTimer = null;

        // Handle input - save content
        kb.addEventListener('input', () => {
            item.content = kb.textContent;
            eventBus.emit(Events.AUTOSAVE_TRIGGER);
            hasUnsavedChanges = true;

            // Debounced save to undo stack
            if (undoSaveTimer) clearTimeout(undoSaveTimer);
            undoSaveTimer = setTimeout(() => {
                if (hasUnsavedChanges && item.content !== contentBeforeEdit) {
                    eventBus.emit(Events.STATE_SAVE);
                    contentBeforeEdit = item.content;
                    hasUnsavedChanges = false;
                }
            }, 1000);
        }, { signal });

        // Handle blur - save state if changed
        kb.addEventListener('blur', () => {
            el.classList.remove('editing');
            if (undoSaveTimer) {
                clearTimeout(undoSaveTimer);
                undoSaveTimer = null;
            }
            if (hasUnsavedChanges && item.content !== contentBeforeEdit) {
                eventBus.emit(Events.STATE_SAVE);
                contentBeforeEdit = item.content;
                hasUnsavedChanges = false;
            }
        }, { signal });

        // Record current state for undo on focus
        kb.addEventListener('focus', () => {
            el.classList.add('editing');
            contentBeforeEdit = item.content;
            hasUnsavedChanges = false;
        }, { signal });

        // Prevent Enter key from adding new lines (keyword should be single-line)
        kb.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                kb.blur();
            }
        }, { signal });

    // Block paste of formatted content - only allow plain text
    kb.addEventListener('paste', e => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        // Remove any newlines from pasted content
        const cleanText = text.replace(/[\r\n]+/g, ' ').trim();
        document.execCommand('insertText', false, cleanText);
    }, { signal });
}

/**
 * Setup link-specific events (click to open, double-click to rename)
 */
function setupLinkItemEvents(item, el, signal) {
    const itemLink = el.querySelector('.item-link');
    let clickStartX = 0;
    let clickStartY = 0;
    let clickStartTime = 0;
    let singleClickTimer = null;
    const DRAG_THRESHOLD = 5; // pixels
    const CLICK_TIMEOUT = 300; // ms
    const DBLCLICK_DELAY = 250; // ms to wait before opening link (to detect double-click)

        // Track mousedown position to distinguish click from drag
        itemLink.addEventListener('mousedown', e => {
            clickStartX = e.clientX;
            clickStartY = e.clientY;
            clickStartTime = Date.now();
        }, { signal });

        // Single click to open link (but not if it was a drag, and delay to allow double-click detection)
        itemLink.addEventListener('click', e => {
            // Don't open link if in editing mode or clicking on control buttons
            // Also check if clicking on any contenteditable element (cursor positioning)
            if (itemLink.classList.contains('editing-mode') ||
                e.target.closest('.delete-btn') || e.target.closest('.color-btn') ||
                e.target.closest('.color-picker') || e.target.closest('.resize-handle') ||
                e.target.closest('.link-title.editing') ||
                e.target.closest('[contenteditable="true"]')) {
                return;
            }

            const dx = Math.abs(e.clientX - clickStartX);
            const dy = Math.abs(e.clientY - clickStartY);
            const elapsed = Date.now() - clickStartTime;

            // Only open if it was a quick click without much movement (not a drag)
            if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD && elapsed < CLICK_TIMEOUT) {
                e.preventDefault();
                e.stopPropagation();

                // Clear any existing timer
                if (singleClickTimer) {
                    clearTimeout(singleClickTimer);
                    singleClickTimer = null;
                }

                // Delay opening link to allow double-click detection
                singleClickTimer = setTimeout(() => {
                    singleClickTimer = null;
                    window.open(item.content.url, '_blank');
                }, DBLCLICK_DELAY);
            }
        }, { signal });

        // Double-click to rename link title
        itemLink.addEventListener('dblclick', e => {
            e.preventDefault();
            e.stopPropagation();

            // Cancel single-click timer to prevent opening link
            if (singleClickTimer) {
                clearTimeout(singleClickTimer);
                singleClickTimer = null;
            }

        eventBus.emit(Events.LINK_RENAME, item);
    }, { signal });
}

/**
 * Setup video-specific events (play/pause, seek, mute, fullscreen)
 */
function setupVideoEvents(item, el, signal) {
    const videoContainer = el.querySelector('.video-container');
    const video = el.querySelector('.item-video');
    const playBtn = el.querySelector('.video-play-btn');
    const muteBtn = el.querySelector('.video-mute-btn');
    const fullscreenBtn = el.querySelector('.video-fullscreen-btn');
    const progressContainer = el.querySelector('.video-progress-container');
    const progressFilled = el.querySelector('.video-progress-filled');
    const timeDisplay = el.querySelector('.video-time');

        // Format time as m:ss
        const formatTime = (seconds) => {
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
        };

        // Update progress bar and time
        const updateProgress = () => {
            if (video.duration) {
                const percent = (video.currentTime / video.duration) * 100;
                progressFilled.style.width = `${percent}%`;
                timeDisplay.textContent = formatTime(video.currentTime);
            }
        };

        // Play/pause toggle
        playBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        }, { signal });

        // Update play/pause icon state
        video.addEventListener('play', () => {
            videoContainer.classList.add('video-playing');
        }, { signal });
        video.addEventListener('pause', () => {
            videoContainer.classList.remove('video-playing');
        }, { signal });
        video.addEventListener('ended', () => {
            videoContainer.classList.remove('video-playing');
        }, { signal });

        // Update progress during playback
        video.addEventListener('timeupdate', updateProgress, { signal });
        video.addEventListener('loadedmetadata', updateProgress, { signal });

        // Click on progress bar to seek
        let isSeeking = false;
        const seek = (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            if (video.duration) {
                video.currentTime = percent * video.duration;
                updateProgress();
            }
        };

        progressContainer.addEventListener('mousedown', e => {
            e.stopPropagation();
            isSeeking = true;
            seek(e);
        }, { signal });

        // Window-level listeners for video seeking - store for manual cleanup
        const handleVideoSeekMove = e => {
            if (isSeeking) {
                e.preventDefault();
                seek(e);
            }
        };
        const handleVideoSeekUp = () => {
            isSeeking = false;
        };
        window.addEventListener('mousemove', handleVideoSeekMove);
        window.addEventListener('mouseup', handleVideoSeekUp);
        item._windowHandlers.push(
            { type: 'mousemove', handler: handleVideoSeekMove },
            { type: 'mouseup', handler: handleVideoSeekUp }
        );

        // Mute toggle
        muteBtn.addEventListener('click', e => {
            e.stopPropagation();
            video.muted = !video.muted;
            videoContainer.classList.toggle('video-muted', video.muted);
        }, { signal });

        // Fullscreen toggle
        fullscreenBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (document.fullscreenElement === videoContainer) {
                document.exitFullscreen();
            } else {
                videoContainer.requestFullscreen();
            }
        }, { signal });

        // Double-click on video area to toggle play/pause
        videoContainer.addEventListener('dblclick', e => {
            if (!e.target.closest('.video-controls')) {
                e.stopPropagation();
                if (video.paused) {
                    video.play();
                } else {
                    video.pause();
                }
            }
        }, { signal });

    // Prevent video controls from triggering drag
    el.querySelector('.video-controls').addEventListener('mousedown', e => {
        e.stopPropagation();
    }, { signal });
}

/**
 * Main setup function - delegates to type-specific handlers
 */
function setupItemEvents(item) {
    const el = item.el;

    // Create AbortController for cleanup - all listeners will use this signal
    const controller = new AbortController();
    const signal = controller.signal;
    item._abortController = controller;
    // Store window-level handlers for manual cleanup (AbortController doesn't help with window listeners)
    item._windowHandlers = [];

    // Common events for all item types
    setupItemCommonEvents(item, el, signal);

    // Type-specific events
    switch (item.type) {
        case 'memo':
            setupMemoEvents(item, el, signal);
            break;
        case 'keyword':
            setupKeywordEvents(item, el, signal);
            break;
        case 'link':
            setupLinkItemEvents(item, el, signal);
            break;
        case 'video':
            setupVideoEvents(item, el, signal);
            break;
    }
}

// Set paragraph alignment (left, center, right)
function setAlignment(el, alignment) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    // Get all block elements that contain the selection
    const range = sel.getRangeAt(0);
    const startNode = range.startContainer;
    const endNode = range.endContainer;

    // Find all block elements within the selection
    const blockTags = ['DIV', 'P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'LI'];

    // Helper to find the closest block parent
    function findBlockParent(node) {
        while (node && node !== el) {
            if (node.nodeType === Node.ELEMENT_NODE && blockTags.includes(node.tagName)) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    // Helper to wrap text nodes in a div for alignment
    function wrapInDiv(node) {
        // Find the text node or inline elements to wrap
        let current = node;
        while (current && current !== el && current.parentNode !== el) {
            current = current.parentNode;
        }

        if (current && current.parentNode === el) {
            if (current.nodeType === Node.TEXT_NODE ||
                (current.nodeType === Node.ELEMENT_NODE && !blockTags.includes(current.tagName))) {
                const div = document.createElement('div');
                current.parentNode.insertBefore(div, current);
                div.appendChild(current);
                return div;
            }
        }
        return null;
    }

    // Get blocks to align
    const blocksToAlign = new Set();

    // If selection is collapsed (just cursor), find the current block
    if (sel.isCollapsed) {
        let block = findBlockParent(startNode);
        if (!block) {
            // If not in a block, wrap the current line in a div
            block = wrapInDiv(startNode);
        }
        if (block) blocksToAlign.add(block);
    } else {
        // For range selection, find all blocks within
        const walker = document.createTreeWalker(
            el,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            {
                acceptNode: node => {
                    if (range.intersectsNode(node)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            const block = findBlockParent(node);
            if (block) {
                blocksToAlign.add(block);
            } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                // Text node not in a block - wrap it
                const wrapped = wrapInDiv(node);
                if (wrapped) blocksToAlign.add(wrapped);
            }
        }
    }

    // Apply alignment to all found blocks
    blocksToAlign.forEach(block => {
        // Always set textAlign explicitly to ensure it overrides any CSS inheritance
        block.style.textAlign = alignment;
    });

    // If no blocks found, create a div wrapper for the entire content
    if (blocksToAlign.size === 0 && el.childNodes.length > 0) {
        // Try using execCommand as fallback
        if (alignment === 'left') {
            document.execCommand('justifyLeft', false, null);
        } else if (alignment === 'center') {
            document.execCommand('justifyCenter', false, null);
        } else if (alignment === 'right') {
            document.execCommand('justifyRight', false, null);
        }
    }
}

// Toggle heading (cycle through H1 -> H2 -> H3 -> normal)
function toggleHeading(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    let node = sel.anchorNode;
    while (node && node !== el) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
                const text = node.textContent;
                let newNode;

                if (tag === 'H1') {
                    newNode = document.createElement('h2');
                } else if (tag === 'H2') {
                    newNode = document.createElement('h3');
                } else {
                    newNode = document.createElement('div');
                }

                newNode.textContent = text;
                node.parentNode.replaceChild(newNode, node);

                const range = document.createRange();
                range.selectNodeContents(newNode);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
                return;
            }
        }
        node = node.parentNode;
    }

    document.execCommand('formatBlock', false, 'h1');
}

// Set item color
export function setItemColor(targetItem, color) {
    const targets = state.selectedItems.size > 0 ? state.selectedItems : new Set([targetItem]);
    targets.forEach(item => {
        item.color = color || null;
        if (color) {
            item.el.style.setProperty('--tag-color', COLOR_MAP[color]);
            item.el.classList.add('has-color');
            item.el.dataset.color = color;
        } else {
            item.el.style.setProperty('--tag-color', 'transparent');
            item.el.classList.remove('has-color');
            delete item.el.dataset.color;
        }
        item.el.querySelectorAll('.color-opt').forEach(o =>
            o.classList.toggle('selected', o.dataset.color === (color || ''))
        );
        if (state.activeFilter !== 'all') {
            if (state.activeFilter === 'none') {
                item.el.classList.toggle('filtered-out', item.color !== null);
            } else {
                item.el.classList.toggle('filtered-out', item.color !== state.activeFilter);
            }
            // Update connection filtering for connections to/from this item
            state.connections.filter(c => c.from === item || c.to === item).forEach(c => {
                const fromFiltered = c.from.el.classList.contains('filtered-out');
                const toFiltered = c.to.el.classList.contains('filtered-out');
                const isFiltered = fromFiltered || toFiltered;
                c.el.classList.toggle('filtered-out', isFiltered);
                if (c.hitArea) c.hitArea.classList.toggle('filtered-out', isFiltered);
                if (c.arrow) c.arrow.classList.toggle('filtered-out', isFiltered);
                if (c.labelEl) c.labelEl.classList.toggle('filtered-out', isFiltered);
            });
        }
        // Update connections from this node
        state.connections.filter(c => c.from === item).forEach(c => eventBus.emit(Events.CONNECTIONS_UPDATE, c));
    });
    throttledMinimap();

    // If color group mode is active, re-arrange all items to reflect the color change
    if (state.colorGroupModeActive) {
        arrangeByColor();
    }

    eventBus.emit(Events.STATE_SAVE);
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

// Set item font size
export function setItemFontSize(item) {
    if (item.type !== 'memo') return;
    const currentIndex = FONT_SIZES.indexOf(item.fontSize);
    const nextIndex = (currentIndex + 1) % FONT_SIZES.length;
    const newSize = FONT_SIZES[nextIndex];

    FONT_SIZES.forEach(s => { if (s) item.el.classList.remove('font-size-' + s); });
    item.fontSize = newSize;
    if (newSize) {
        item.el.classList.add('font-size-' + newSize);
    }
    eventBus.emit(Events.STATE_SAVE);
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

// Select an item
export function selectItem(item, accumulate = false) {
    if (!accumulate) deselectAll();
    state.selectedItems.add(item);
    item.el.classList.add('selected');
    // Always bring selected item to top (z-index)
    item.el.style.zIndex = state.incrementHighestZ();
    state.setSelectedItem(item);
}

// Deselect all items
export function deselectAll() {
    state.selectedItems.forEach(i => i.el.classList.remove('selected'));
    state.selectedItems.clear();
    state.setSelectedItem(null);

    if (state.selectedConn) {
        state.selectedConn.el.classList.remove('selected');
        if (state.selectedConn.arrow) state.selectedConn.arrow.classList.remove('selected');
        state.setSelectedConn(null);
    }
    hideMenus();
    document.querySelectorAll('.color-picker.active').forEach(p => p.classList.remove('active'));
}

// Hide all menus
function hideMenus() {
    $('contextMenu').classList.remove('active');
    $('canvasContextMenu').classList.remove('active');
    $('connectionContextMenu').classList.remove('active');
    $('filterDropdown').classList.remove('active');
    $('colorDropdown').classList.remove('active');
    $('connDirectionPicker').classList.remove('active');
    $('canvasIconPicker').classList.remove('active');
    // Also hide sidebar context menus
    $('sidebarCanvasContextMenu')?.classList.remove('active');
    $('sidebarGroupContextMenu')?.classList.remove('active');
    $('sidebarEmptyContextMenu')?.classList.remove('active');
    $('groupSubmenu')?.classList.remove('active');
}

export { hideMenus, toggleHeading };

// Clean up all event listeners attached to an item
// This prevents memory leaks when deleting items
function cleanupItemEvents(item) {
    // Abort all element-level listeners registered with the AbortController
    if (item._abortController) {
        item._abortController.abort();
        item._abortController = null;
    }

    // Remove window-level listeners (video seeking, etc.)
    if (item._windowHandlers) {
        item._windowHandlers.forEach(({ type, handler }) => {
            window.removeEventListener(type, handler);
        });
        item._windowHandlers = null;
    }

    // Remove document-level selectionchange listener for memos
    if (item._selectionChangeHandler) {
        document.removeEventListener('selectionchange', item._selectionChangeHandler);
        item._selectionChangeHandler = null;
    }

    // Remove media error handlers for image/video items
    if (item.type === 'image' || item.type === 'video') {
        const mediaEl = item.el.querySelector('.item-image, .item-video');
        if (mediaEl && mediaEl._errorHandler) {
            mediaEl.removeEventListener('error', mediaEl._errorHandler);
            mediaEl._errorHandler = null;
        }
    }
}

function pruneSearchResults(removedItems) {
    if (!state.searchResults.length) return false;
    const removedSet = new Set(removedItems);
    const previousResults = state.searchResults;
    const nextResults = previousResults.filter(result => !removedSet.has(result));

    if (nextResults.length === previousResults.length) return false;

    let nextIndex = state.searchIndex;
    if (nextIndex >= 0) {
        const removedBeforeOrAt = previousResults
            .slice(0, Math.min(nextIndex + 1, previousResults.length))
            .filter(result => removedSet.has(result)).length;
        nextIndex -= removedBeforeOrAt;
    }

    if (nextResults.length === 0) {
        nextIndex = -1;
    } else if (nextIndex < 0) {
        nextIndex = 0;
    } else if (nextIndex >= nextResults.length) {
        nextIndex = nextResults.length - 1;
    }

    state.setSearchResults(nextResults);
    state.setSearchIndex(nextIndex);
    return true;
}

// Delete selected items
export function deleteSelectedItems() {
    if (!state.selectedItems.size) return;
    eventBus.emit(Events.STATE_SAVE);
    const removedItems = Array.from(state.selectedItems);
    removedItems.forEach(item => deleteItem(item, false, true, false));
    if (pruneSearchResults(removedItems)) {
        eventBus.emit(Events.SEARCH_RESULTS_UPDATED);
    }
    state.selectedItems.clear();
    throttledMinimap();
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

// Delete a single item
export function deleteItem(item, update = true, withFade = true, updateSearch = true) {
    // Clean up event listeners to prevent memory leaks
    cleanupItemEvents(item);

    // Delete connections without fade (they disappear with the node)
    state.connections.filter(c => c.from === item || c.to === item).forEach(c => eventBus.emit(Events.CONNECTIONS_DELETE, c, false, false));

    if ((item.type === 'image' || item.type === 'video') && item.content?.startsWith('media_')) {
        deleteMedia(item.content);
        if (fsDirectoryHandle) {
            deleteMediaFromFileSystem(item.content);
        }
        const url = state.blobURLCache.get(item.content);
        if (url) {
            URL.revokeObjectURL(url);
            state.blobURLCache.delete(item.content);
        }
    }

    if (updateSearch && pruneSearchResults([item])) {
        eventBus.emit(Events.SEARCH_RESULTS_UPDATED);
    }

    const i = state.items.indexOf(item);
    if (i > -1) {
        state.items.splice(i, 1);
        if (withFade) {
            // Add fade animation then remove
            item.el.classList.add('deleting');
            item.el.addEventListener('animationend', () => item.el.remove(), { once: true });
        } else {
            item.el.remove();
        }
    }

    if (update) {
        // If color group mode is active, re-arrange items to fill the gap
        if (state.colorGroupModeActive) {
            // Delay slightly to allow DOM updates
            setTimeout(() => arrangeByColor(), 50);
        }
        eventBus.emit(Events.STATE_SAVE);
        throttledMinimap();
        eventBus.emit(Events.AUTOSAVE_TRIGGER);
    }
}

// Duplicate an item
export function duplicateItem(item) {
    const pos = findFreePosition(item.x + 24, item.y + 24, state.items);
    createItem({
        type: item.type,
        x: pos.x,
        y: pos.y,
        w: item.w,
        h: item.h,
        content: JSON.parse(JSON.stringify(item.content)),
        color: item.color,
        fontSize: item.fontSize,
        textAlign: item.textAlign
    });
    eventBus.emit(Events.STATE_SAVE);
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

// Duplicate an item for drag operation (same position, no auto-save)
function duplicateItemForDrag(item) {
    return createItem({
        type: item.type,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        content: JSON.parse(JSON.stringify(item.content)),
        color: item.color,
        fontSize: item.fontSize,
        textAlign: item.textAlign
    });
}

// Calculate default height based on font size for memos
function getDefaultHeight(fontSize) {
    let fontMultiplier = 1;
    if (fontSize === 'medium') fontMultiplier = 1.15;
    else if (fontSize === 'large') fontMultiplier = 1.4;
    else if (fontSize === 'xlarge') fontMultiplier = 1.7;

    return Math.round(140 * fontMultiplier);
}

// Calculate memo size based on text content
function calculateMemoSizeForText(text, fontSize) {
    if (!text) return null;

    let fontMultiplier = 1;
    if (fontSize === 'medium') fontMultiplier = 1.15;
    else if (fontSize === 'large') fontMultiplier = 1.4;
    else if (fontSize === 'xlarge') fontMultiplier = 1.7;

    const baseFontSize = 13 * fontMultiplier;
    const lineHeight = baseFontSize * 1.6;
    const charWidth = baseFontSize * 0.6; // Approximate character width

    // Split text into lines
    const lines = text.split('\n');
    const lineCount = lines.length;

    // Find the longest line
    let maxLineLength = 0;
    for (const line of lines) {
        if (line.length > maxLineLength) {
            maxLineLength = line.length;
        }
    }

    // Calculate width based on longest line (min 220, max 500)
    const baseWidth = 220;
    const padding = 24; // 12px * 2
    const contentWidth = maxLineLength * charWidth + padding;
    const width = Math.max(baseWidth, Math.min(contentWidth, 500));

    // Calculate height based on line count
    // Account for word wrapping: estimate how many wrapped lines there will be
    const availableWidth = width - padding;
    let totalLines = 0;
    for (const line of lines) {
        const lineWidth = line.length * charWidth;
        const wrappedLines = Math.max(1, Math.ceil(lineWidth / availableWidth));
        totalLines += wrappedLines;
    }

    // Height: content + padding(24) + toolbar area(38) + buffer(3)
    const extraH = 24 + 38 + 3;
    const minH = Math.round(140 * fontMultiplier);
    const maxH = Math.round(600 * fontMultiplier);
    const contentHeight = totalLines * lineHeight;
    const height = Math.max(minH, Math.min(contentHeight + extraH, maxH));

    return { w: Math.round(width), h: Math.round(height) };
}

/**
 * Add a new memo item to the canvas
 * @param {string} [text=''] - Initial text content
 * @param {number} x - X position (adjusted to find free space)
 * @param {number} y - Y position (adjusted to find free space)
 * @param {string|null} [color=null] - Color name from COLOR_MAP
 * @returns {Object} Created memo item
 */
export function addMemo(text = '', x, y, color = null) {
    const pos = findFreePosition(x, y, state.items);
    // Apply default font size setting
    const fontSize = state.defaultFontSize !== 'small' ? state.defaultFontSize : null;
    // Apply default text alignment setting
    const textAlign = state.defaultTextAlign !== 'left' ? state.defaultTextAlign : null;

    // Calculate size based on text content if provided
    const calculatedSize = text ? calculateMemoSizeForText(text, fontSize) : null;
    const defaultW = 220;
    const defaultH = getDefaultHeight(fontSize);

    const item = createItem({
        type: 'memo',
        x: pos.x,
        y: pos.y,
        w: calculatedSize ? calculatedSize.w : defaultW,
        h: calculatedSize ? calculatedSize.h : defaultH,
        content: text,
        color,
        fontSize,
        textAlign
    });
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
    return item;
}

/**
 * Add a new keyword item (pill-shaped concept node)
 * @param {string} [text=''] - Initial text content
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string|null} [color=null] - Color name from COLOR_MAP
 * @returns {Object} Created keyword item
 */
export function addKeyword(text = '', x, y, color = null) {
    const pos = findFreePosition(x, y, state.items);

    // Calculate width based on text length (min 256, max 640)
    // Font size is 24px, so char width ~14px
    const charWidth = 14;
    const padding = 80;
    const minW = 256;
    const maxW = 640;
    const textWidth = text.length * charWidth + padding;
    const w = Math.max(minW, Math.min(textWidth, maxW));

    const item = createItem({
        type: 'keyword',
        x: pos.x,
        y: pos.y,
        w: w,
        h: 56,
        content: text,
        color
    });
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
    return item;
}

/**
 * Add a new link item to the canvas
 * @param {string} url - URL to link to
 * @param {string} [title] - Custom title (auto-fetched if not provided)
 * @param {number} x - X position
 * @param {number} y - Y position
 * @returns {Object} Created link item
 */
export function addLink(url, title, x, y) {
    const pos = findFreePosition(x, y, state.items);
    const domain = new URL(url).hostname;
    // Use larger height when link preview is enabled to accommodate 3:2 preview image
    // Without preview: 116px = favicon(28) + gap(10) + title(~18) + gap(10) + url(~18) + padding(32)
    // With preview: 280px = favicon(28) + gap(6) + title(~18) + gap(6) + url(~18) + gap(6) + preview(~152) + padding(32) + buffer
    const height = state.linkPreviewEnabled ? 280 : 116;
    const userProvidedTitle = title && title.trim();
    const item = createItem({
        type: 'link',
        x: pos.x,
        y: pos.y,
        w: 260,
        h: height,
        content: {
            url,
            title: userProvidedTitle || domain,
            display: url.replace(/^https?:\/\//, '').replace(/\/$/, '')
        }
    });
    // Fetch page title if user didn't provide a custom title
    if (!userProvidedTitle) {
        fetchLinkMetadata(item);
    } else if (state.linkPreviewEnabled) {
        // Still load preview image if enabled
        loadLinkPreviewForItem(item);
    }
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
    return item;
}

// Set filter
export function setFilter(color) {
    state.setActiveFilter(color);
    $('filterDropdown').querySelectorAll('.filter-opt').forEach(o =>
        o.classList.toggle('selected', o.dataset.color === color)
    );
    $('filterBtn').classList.toggle('filter-active', color !== 'all');

    state.items.forEach(item => {
        let isFilteredOut = false;
        if (color === 'all') {
            isFilteredOut = false;
        } else if (color === 'none') {
            // Show only items without a color
            isFilteredOut = item.color !== null;
        } else {
            // Show only items with the specified color
            isFilteredOut = item.color !== color;
        }
        item.el.classList.toggle('filtered-out', isFilteredOut);
    });

    // Also apply filtering to connections (when either endpoint is filtered)
    // This ensures connections to/from invisible items are also hidden
    state.connections.forEach(c => {
        const fromFiltered = c.from.el.classList.contains('filtered-out');
        const toFiltered = c.to.el.classList.contains('filtered-out');
        const isFiltered = fromFiltered || toFiltered;
        c.el.classList.toggle('filtered-out', isFiltered);
        if (c.hitArea) c.hitArea.classList.toggle('filtered-out', isFiltered);
        if (c.arrow) c.arrow.classList.toggle('filtered-out', isFiltered);
        if (c.labelEl) c.labelEl.classList.toggle('filtered-out', isFiltered);
    });

    throttledMinimap();
}

// Toggle color group mode - arranges items by color and can restore original positions
export function toggleColorGroupMode() {
    const btn = $('sortByColorBtn');

    if (state.colorGroupModeActive) {
        // Deactivate mode - restore original positions
        restoreOriginalPositions();
        state.setColorGroupModeActive(false);
        state.setOriginalPositions(new Map());
        btn.classList.remove('active');
    } else {
        // Activate mode - save positions and arrange by color
        if (state.items.length === 0) return;
        saveOriginalPositions();
        arrangeByColor();
        state.setColorGroupModeActive(true);
        btn.classList.add('active');
    }
}

// Save original positions of all items before arranging
function saveOriginalPositions() {
    const positions = new Map();
    state.items.forEach(item => {
        positions.set(item.id, { x: item.x, y: item.y });
    });
    state.setOriginalPositions(positions);
}

// Restore items to their original positions with animation
function restoreOriginalPositions() {
    // Add animation class to all items
    state.items.forEach(item => item.el.classList.add('color-group-animating'));

    // Apply position changes (will animate due to CSS transition)
    state.items.forEach(item => {
        const original = state.originalPositions.get(item.id);
        if (original) {
            item.x = original.x;
            item.y = original.y;
            item.el.style.left = item.x + 'px';
            item.el.style.top = item.y + 'px';
        }
    });

    const animationDuration = 400;
    const fadeOutDuration = 150;
    const fadeInDuration = 250;

    // Helper to apply class to all connection elements
    const applyToConnections = (addClass, removeClass) => {
        const svg = document.getElementById('connectionsSvg');
        if (!svg) return;
        const elements = svg.querySelectorAll('.connection-line, .connection-hit-area, .connection-arrow, .connection-label');
        elements.forEach(el => {
            if (removeClass) {
                if (Array.isArray(removeClass)) {
                    removeClass.forEach(cls => el.classList.remove(cls));
                } else {
                    el.classList.remove(removeClass);
                }
            }
            if (addClass) el.classList.add(addClass);
        });
    };

    // Step 1: Fade out connections
    applyToConnections('color-group-fade-out', null);

    // Step 2: After fade-out, hide connections and update positions silently
    setTimeout(() => {
        applyToConnections('color-group-hidden', 'color-group-fade-out');
    }, fadeOutDuration);

    // Update connections during animation (they're hidden, so this is silent)
    const animateConnections = () => {
        eventBus.emit(Events.CONNECTIONS_UPDATE_ALL);
        updateMinimap();
    };
    const frames = 10;
    for (let i = 0; i <= frames; i++) {
        setTimeout(animateConnections, fadeOutDuration + (animationDuration / frames) * i);
    }

    // Step 3: After animation completes, fade connections back in
    setTimeout(() => {
        // Final position update
        eventBus.emit(Events.CONNECTIONS_UPDATE_ALL);
        // Remove hidden, add fade-in
        applyToConnections('color-group-fade-in', 'color-group-hidden');
    }, fadeOutDuration + animationDuration);

    // Step 4: Clean up all animation classes
    setTimeout(() => {
        state.items.forEach(item => item.el.classList.remove('color-group-animating'));
        applyToConnections(null, ['color-group-fade-in', 'color-group-hidden', 'color-group-fade-out']);
    }, fadeOutDuration + animationDuration + fadeInDuration + 50);

    eventBus.emit(Events.STATE_SAVE);
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

// Arrange items by color - called when activating color group mode
function arrangeByColor() {
    // Color order: red, orange, yellow, green, blue, purple, pink, then no color (null)
    const colorOrder = [...COLORS, null];
    const MAX_ROWS = 5; // Maximum items per column before creating new column
    const horizontalGap = 48; // Horizontal spacing between color groups
    const verticalGap = 24;   // Vertical spacing between items
    const subColumnGap = 24;  // Gap between sub-columns within same color group

    // Add animation class to all items
    state.items.forEach(item => item.el.classList.add('color-group-animating'));

    // Group items by color
    const groups = {};
    colorOrder.forEach(c => groups[c === null ? 'none' : c] = []);

    state.items.forEach(item => {
        const key = item.color || 'none';
        if (groups[key]) {
            groups[key].push(item);
        } else {
            groups['none'].push(item);
        }
    });

    // Sort items within each color group by connection proximity
    Object.keys(groups).forEach(key => {
        const items = groups[key];
        if (items.length <= 1) return;

        // Build connection map for items in this group
        const connectionMap = new Map();
        items.forEach(item => connectionMap.set(item, new Set()));

        state.connections.forEach(conn => {
            const fromInGroup = items.includes(conn.from);
            const toInGroup = items.includes(conn.to);
            if (fromInGroup && toInGroup) {
                connectionMap.get(conn.from).add(conn.to);
                connectionMap.get(conn.to).add(conn.from);
            }
        });

        // Sort items to group connected items together
        const sorted = [];
        const visited = new Set();

        // DFS to group connected items
        function addWithConnections(item) {
            if (visited.has(item)) return;
            visited.add(item);
            sorted.push(item);
            const connected = connectionMap.get(item);
            connected.forEach(connectedItem => {
                if (!visited.has(connectedItem)) {
                    addWithConnections(connectedItem);
                }
            });
        }

        // Start with items that have connections
        items.forEach(item => {
            if (connectionMap.get(item).size > 0 && !visited.has(item)) {
                addWithConnections(item);
            }
        });

        // Add remaining items without connections
        items.forEach(item => {
            if (!visited.has(item)) {
                sorted.push(item);
            }
        });

        groups[key] = sorted;
    });

    // Get active colors (colors that have items)
    const activeColors = colorOrder.filter(c => {
        const key = c === null ? 'none' : c;
        return groups[key].length > 0;
    });

    // Build column layout data with multi-column support for groups > MAX_ROWS
    const colorGroupData = activeColors.map(color => {
        const key = color === null ? 'none' : color;
        const items = groups[key];

        // Split items into sub-columns of max MAX_ROWS each
        const subColumns = [];
        for (let i = 0; i < items.length; i += MAX_ROWS) {
            subColumns.push(items.slice(i, i + MAX_ROWS));
        }

        // Calculate dimensions for each sub-column
        const subColumnData = subColumns.map(subItems => {
            const maxWidth = Math.max(...subItems.map(item => item.w));
            const totalHeight = subItems.reduce((sum, item, idx) => {
                return sum + item.h + (idx < subItems.length - 1 ? verticalGap : 0);
            }, 0);
            return { items: subItems, maxWidth, totalHeight };
        });

        // Total width for this color group (sum of sub-columns + gaps between them)
        const groupWidth = subColumnData.reduce((sum, sc, idx) => {
            return sum + sc.maxWidth + (idx < subColumnData.length - 1 ? subColumnGap : 0);
        }, 0);

        // Max height among sub-columns
        const groupHeight = Math.max(...subColumnData.map(sc => sc.totalHeight));

        return { color, key, subColumnData, groupWidth, groupHeight };
    });

    // Calculate total width and max height
    const totalWidth = colorGroupData.reduce((sum, group, idx) => {
        return sum + group.groupWidth + (idx < colorGroupData.length - 1 ? horizontalGap : 0);
    }, 0);
    const maxGroupHeight = Math.max(...colorGroupData.map(group => group.groupHeight));

    // Find the visible area center
    const viewCenterX = (innerWidth / 2 - state.offsetX) / state.scale;
    const viewCenterY = (innerHeight / 2 - state.offsetY) / state.scale;

    // Calculate start position to center the grid
    const startX = viewCenterX - totalWidth / 2;
    const startY = viewCenterY - maxGroupHeight / 2;

    // Place items - iterate through color groups, then sub-columns, then items
    let currentGroupX = startX;
    colorGroupData.forEach(group => {
        let currentSubColX = currentGroupX;

        group.subColumnData.forEach((subCol, subIdx) => {
            let currentY = startY;

            subCol.items.forEach(item => {
                // Center each item horizontally within its sub-column
                const itemOffsetX = (subCol.maxWidth - item.w) / 2;
                item.x = currentSubColX + itemOffsetX;
                item.y = currentY;
                item.el.style.left = item.x + 'px';
                item.el.style.top = item.y + 'px';
                currentY += item.h + verticalGap;
            });

            currentSubColX += subCol.maxWidth + subColumnGap;
        });

        currentGroupX += group.groupWidth + horizontalGap;
    });

    const animationDuration = 400;
    const fadeOutDuration = 150;
    const fadeInDuration = 250;

    // Helper to apply class to all connection elements
    const applyToConnections = (addClass, removeClass) => {
        const svg = document.getElementById('connectionsSvg');
        if (!svg) return;
        const elements = svg.querySelectorAll('.connection-line, .connection-hit-area, .connection-arrow, .connection-label');
        elements.forEach(el => {
            if (removeClass) {
                if (Array.isArray(removeClass)) {
                    removeClass.forEach(cls => el.classList.remove(cls));
                } else {
                    el.classList.remove(removeClass);
                }
            }
            if (addClass) el.classList.add(addClass);
        });
    };

    // Step 1: Fade out connections
    applyToConnections('color-group-fade-out', null);

    // Step 2: After fade-out, hide connections and update positions silently
    setTimeout(() => {
        applyToConnections('color-group-hidden', 'color-group-fade-out');
    }, fadeOutDuration);

    // Update connections during animation (they're hidden, so this is silent)
    const animateConnections = () => {
        eventBus.emit(Events.CONNECTIONS_UPDATE_ALL);
        updateMinimap();
    };
    const frames = 10;
    for (let i = 0; i <= frames; i++) {
        setTimeout(animateConnections, fadeOutDuration + (animationDuration / frames) * i);
    }

    // Step 3: After animation completes, fade connections back in
    setTimeout(() => {
        // Final position update
        eventBus.emit(Events.CONNECTIONS_UPDATE_ALL);
        // Remove hidden, add fade-in
        applyToConnections('color-group-fade-in', 'color-group-hidden');
    }, fadeOutDuration + animationDuration);

    // Step 4: Clean up all animation classes
    setTimeout(() => {
        state.items.forEach(item => item.el.classList.remove('color-group-animating'));
        applyToConnections(null, ['color-group-fade-in', 'color-group-hidden', 'color-group-fade-out']);
    }, fadeOutDuration + animationDuration + fadeInDuration + 50);

    eventBus.emit(Events.STATE_SAVE);
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

// Position a new item within the color group layout (called when adding items during color group mode)
export function positionNewItemInColorGroup(newItem) {
    if (!state.colorGroupModeActive) return;

    const colorOrder = [...COLORS, null];
    const MAX_ROWS = 5;
    const horizontalGap = 48;
    const verticalGap = 24;
    const subColumnGap = 24;

    // Find the color group for the new item
    const newItemColor = newItem.color || 'none';

    // Group all items by color
    const groups = {};
    colorOrder.forEach(c => groups[c === null ? 'none' : c] = []);

    state.items.forEach(item => {
        const key = item.color || 'none';
        if (groups[key]) {
            groups[key].push(item);
        } else {
            groups['none'].push(item);
        }
    });

    // Get the items in the same color group (excluding the new item for positioning calculation)
    const sameColorItems = groups[newItemColor].filter(item => item !== newItem);

    if (sameColorItems.length === 0) {
        // This is the first item of this color - re-arrange all items
        arrangeByColor();
        return;
    }

    // Find the last item in the color group to position after it
    const lastItem = sameColorItems[sameColorItems.length - 1];
    const lastRowIndex = sameColorItems.length % MAX_ROWS;

    if (lastRowIndex === 0) {
        // Start a new sub-column - position to the right of the last sub-column
        const maxWidthInLastSubCol = Math.max(...sameColorItems.slice(-MAX_ROWS).map(i => i.w));
        newItem.x = lastItem.x + maxWidthInLastSubCol / 2 - newItem.w / 2 + subColumnGap + newItem.w / 2;

        // Find the topmost Y position among same color items
        const topY = Math.min(...sameColorItems.map(i => i.y));
        newItem.y = topY;
    } else {
        // Add to current sub-column - position below the last item
        newItem.x = lastItem.x + lastItem.w / 2 - newItem.w / 2; // Center align with last item
        newItem.y = lastItem.y + lastItem.h + verticalGap;
    }

    newItem.el.style.left = newItem.x + 'px';
    newItem.el.style.top = newItem.y + 'px';

    eventBus.emit(Events.CONNECTIONS_UPDATE_ALL);
    updateMinimap();
}
