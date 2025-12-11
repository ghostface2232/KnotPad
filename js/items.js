// KnotPad - Items Module (Create, Manage, Delete)

import { COLORS, COLOR_MAP, FONT_SIZES } from './constants.js';
import { $, esc, findFreePosition } from './utils.js';
import * as state from './state.js';
import { throttledMinimap, updateMinimap } from './viewport.js';
import { deleteMedia, deleteMediaFromFileSystem, fsDirectoryHandle } from './storage.js';

const canvas = $('canvas');

// ============ Markdown Parser ============

function parseMarkdown(text) {
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

    // Strikethrough: ~~text~~
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Underline: __text__
    html = html.replace(/__(.+?)__/g, '<u>$1</u>');

    // Unordered list: - item
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered list: 1. item
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up consecutive blockquotes
    html = html.replace(/<\/blockquote><br><blockquote>/g, '</blockquote><blockquote>');

    return html;
}

function getPlainText(el) {
    // Get plain text from contenteditable, preserving line breaks
    const clone = el.cloneNode(true);
    // Replace block elements with newlines
    clone.querySelectorAll('h1, h2, h3, p, div, li, blockquote, hr').forEach(block => {
        block.insertAdjacentText('beforebegin', '\n');
    });
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    let text = clone.textContent || '';
    // Clean up multiple newlines
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
}

// External function references (set by other modules)
let updateAllConnectionsFn = () => {};
let updateConnectionFn = () => {};
let deleteConnectionFn = () => {};
let saveStateFn = () => {};
let triggerAutoSaveFn = () => {};
let showChildTypePickerFn = () => {};
let startConnectionFn = () => {};
let completeConnectionFn = () => {};
let showContextMenuFn = () => {};

export function setExternalFunctions({
    updateAllConnections,
    updateConnection,
    deleteConnection,
    saveState,
    triggerAutoSave,
    showChildTypePicker,
    startConnection,
    completeConnection,
    showContextMenu
}) {
    if (updateAllConnections) updateAllConnectionsFn = updateAllConnections;
    if (updateConnection) updateConnectionFn = updateConnection;
    if (deleteConnection) deleteConnectionFn = deleteConnection;
    if (saveState) saveStateFn = saveState;
    if (triggerAutoSave) triggerAutoSaveFn = triggerAutoSave;
    if (showChildTypePicker) showChildTypePickerFn = showChildTypePicker;
    if (startConnection) startConnectionFn = startConnection;
    if (completeConnection) completeConnectionFn = completeConnection;
    if (showContextMenu) showContextMenuFn = showContextMenu;
}

// Create an item on the canvas
export function createItem(cfg, loading = false) {
    // Migrate legacy 'note' type to 'memo'
    if (cfg.type === 'note') {
        cfg.type = 'memo';
        // Convert note content {title, body} to memo content (string)
        // Title becomes a markdown heading
        if (cfg.content && typeof cfg.content === 'object') {
            const title = cfg.content.title || '';
            const body = cfg.content.body || '';
            cfg.content = title ? ('# ' + title + '\n' + body).trim() : body;
        }
    }

    const el = document.createElement('div');
    el.className = 'canvas-item' + (loading ? '' : ' new');
    el.style.cssText = `left:${cfg.x}px;top:${cfg.y}px;width:${cfg.w}px;height:${cfg.h}px;z-index:${state.incrementHighestZ()}`;

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
            html = `<video class="item-video" src="${mediaSrc}" controls></video>`;
            break;
        case 'memo':
            html = `<div class="item-memo"><div class="memo-body" contenteditable="true" data-placeholder="Write something...">${parseMarkdown(cfg.content || '')}</div><div class="memo-toolbar"><button class="md-btn" data-md="heading" title="Heading"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M4 6h16"/></svg></button><button class="md-btn" data-md="bold" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6zM6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"/></svg></button><button class="md-btn" data-md="strike" title="Strikethrough"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4H9a3 3 0 000 6h6a3 3 0 010 6H8M4 12h16"/></svg></button><button class="md-btn" data-md="underline" title="Underline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4v6a6 6 0 0012 0V4M4 20h16"/></svg></button></div></div>`;
            break;
        case 'link':
            html = `<div class="item-link"><img class="link-favicon" src="https://www.google.com/s2/favicons?domain=${new URL(cfg.content.url).hostname}&sz=64"><div class="link-title">${esc(cfg.content.title)}</div><a class="link-url" href="${cfg.content.url}" target="_blank">${cfg.content.display}</a></div>`;
            break;
    }

    if (cfg.color) {
        el.style.setProperty('--tag-color', COLOR_MAP[cfg.color]);
        el.classList.add('has-color');
    }

    if (cfg.fontSize && cfg.type === 'memo') {
        el.classList.add('font-size-' + cfg.fontSize);
    }

    const fontSizeBtn = cfg.type === 'memo'
        ? `<button class="font-size-btn" title="Font Size"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg></button>`
        : '';

    el.innerHTML = `<div class="color-dot"></div><div class="item-content">${html}</div><button class="delete-btn">×</button>${fontSizeBtn}<button class="color-btn"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="7.5" r="2" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12.5" r="2" fill="currentColor" stroke="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"/></svg></button><div class="color-picker"><div class="color-opt none" data-color="" title="None"></div>${COLORS.map(c => `<div class="color-opt" data-color="${c}" style="background:${COLOR_MAP[c]}" title="${c}"></div>`).join('')}</div><div class="resize-handle"></div><div class="connection-handle top" data-h="top"></div><div class="connection-handle bottom" data-h="bottom"></div><div class="connection-handle left" data-h="left"></div><div class="connection-handle right" data-h="right"></div><button class="add-child-btn top" data-d="top">+</button><button class="add-child-btn bottom" data-d="bottom">+</button><button class="add-child-btn left" data-d="left">+</button><button class="add-child-btn right" data-d="right">+</button>`;

    canvas.appendChild(el);

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
        locked: cfg.locked || false
    };

    state.items.push(item);
    setupItemEvents(item);

    if (!loading) {
        throttledMinimap();
        if (state.activeFilter !== 'all' && item.color !== state.activeFilter) {
            item.el.classList.add('filtered-out');
        }
    }

    setTimeout(() => el.classList.remove('new'), 200);
    return item;
}

// Setup event handlers for an item
function setupItemEvents(item) {
    const el = item.el;

    el.addEventListener('mousedown', e => {
        const t = e.target;
        if (t.classList.contains('delete-btn') || t.classList.contains('resize-handle') ||
            t.classList.contains('connection-handle') || t.classList.contains('add-child-btn') ||
            t.classList.contains('color-btn') || t.classList.contains('font-size-btn') ||
            t.classList.contains('color-opt') || t.closest('.color-picker') ||
            t.tagName === 'VIDEO' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
            return;
        }
        if (item.locked) return;

        e.stopPropagation();
        if (!state.selectedItems.has(item) && !e.shiftKey) {
            selectItem(item, false);
        } else if (e.shiftKey) {
            if (state.selectedItems.has(item)) state.selectedItems.delete(item);
            else state.selectedItems.add(item);
            item.el.classList.toggle('selected');
        } else {
            selectItem(item, true);
        }

        el.style.zIndex = state.incrementHighestZ();
        const rect = el.getBoundingClientRect();
        item.ox = (e.clientX - rect.left) / state.scale;
        item.oy = (e.clientY - rect.top) / state.scale;
        state.setDraggedItem(item);
        state.selectedItems.forEach(i => i.el.classList.add('dragging'));
        canvas.classList.add('dragging-item');
    });

    el.querySelector('.resize-handle').addEventListener('mousedown', e => {
        if (item.locked) return;
        e.stopPropagation();
        state.setResizingItem(item);
    });

    el.querySelector('.delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (state.selectedItems.has(item)) deleteSelectedItems();
        else deleteItem(item);
    });

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
    });

    colorPicker.querySelectorAll('.color-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            setItemColor(item, opt.dataset.color || null);
            colorPicker.classList.remove('active');
        });
    });

    const fontSizeBtn = el.querySelector('.font-size-btn');
    if (fontSizeBtn) {
        fontSizeBtn.addEventListener('click', e => {
            e.stopPropagation();
            setItemFontSize(item);
        });
    }

    el.querySelectorAll('.add-child-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            showChildTypePickerFn(item, btn.dataset.d, e);
        });
    });

    el.querySelectorAll('.connection-handle').forEach(h => {
        h.addEventListener('mousedown', e => {
            e.stopPropagation();
            if (state.connectSource) {
                completeConnectionFn(item, h.dataset.h);
            } else {
                startConnectionFn(item, h.dataset.h);
            }
        });
        h.addEventListener('mouseenter', () => {
            if (state.connectSource && state.connectSource !== item) {
                el.classList.add('connect-target');
            }
        });
        h.addEventListener('mouseleave', () => el.classList.remove('connect-target'));
    });

    el.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!state.selectedItems.has(item)) selectItem(item);
        showContextMenuFn(e.clientX, e.clientY, item);
    });

    if (item.type === 'memo') {
        const mb = el.querySelector('.memo-body');
        const toolbar = el.querySelector('.memo-toolbar');

        // Handle input - store plain text, render markdown
        mb.addEventListener('input', () => {
            item.content = getPlainText(mb);
            autoResizeItem(item);
            triggerAutoSaveFn();
        });

        // Handle blur - re-render markdown
        mb.addEventListener('blur', () => {
            const pos = saveCaretPosition(mb);
            mb.innerHTML = parseMarkdown(item.content || '');
            if (document.activeElement === mb) restoreCaretPosition(mb, pos);
            toolbar.classList.remove('active');
        });

        // Show toolbar on focus
        mb.addEventListener('focus', () => {
            toolbar.classList.add('active');
        });

        // Markdown toolbar buttons
        toolbar.querySelectorAll('.md-btn').forEach(btn => {
            btn.addEventListener('mousedown', e => {
                e.preventDefault(); // Prevent blur
            });
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const md = btn.dataset.md;
                applyMarkdown(mb, md, item);
            });
        });
    }
}

// Save caret position
function saveCaretPosition(el) {
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().length;
}

// Restore caret position
function restoreCaretPosition(el, pos) {
    const sel = window.getSelection();
    const range = document.createRange();
    let currentPos = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (currentPos + node.length >= pos) {
            range.setStart(node, pos - currentPos);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
        }
        currentPos += node.length;
    }
}

// Apply markdown formatting
function applyMarkdown(el, type, item) {
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return;

    const text = item.content || '';
    const lines = text.split('\n');

    // Get current line
    const pos = saveCaretPosition(el);
    let charCount = 0;
    let lineIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        if (charCount + lines[i].length >= pos) {
            lineIndex = i;
            break;
        }
        charCount += lines[i].length + 1; // +1 for newline
    }

    switch (type) {
        case 'heading':
            // Cycle through heading levels
            if (lines[lineIndex].startsWith('### ')) {
                lines[lineIndex] = lines[lineIndex].slice(4);
            } else if (lines[lineIndex].startsWith('## ')) {
                lines[lineIndex] = '### ' + lines[lineIndex].slice(3);
            } else if (lines[lineIndex].startsWith('# ')) {
                lines[lineIndex] = '## ' + lines[lineIndex].slice(2);
            } else {
                lines[lineIndex] = '# ' + lines[lineIndex];
            }
            break;
        case 'bold':
            wrapSelection(el, '**', '**');
            return;
        case 'strike':
            wrapSelection(el, '~~', '~~');
            return;
        case 'underline':
            wrapSelection(el, '__', '__');
            return;
    }

    item.content = lines.join('\n');
    el.innerHTML = parseMarkdown(item.content);
    triggerAutoSaveFn();
}

// Wrap selection with markers
function wrapSelection(el, before, after) {
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const text = range.toString();

    if (text) {
        document.execCommand('insertText', false, before + text + after);
    } else {
        document.execCommand('insertText', false, before + after);
        // Move cursor between markers
        const newRange = document.createRange();
        const textNode = sel.focusNode;
        if (textNode) {
            newRange.setStart(textNode, sel.focusOffset - after.length);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
    }
}

// Set item color
export function setItemColor(targetItem, color) {
    const targets = state.selectedItems.size > 0 ? state.selectedItems : new Set([targetItem]);
    targets.forEach(item => {
        item.color = color || null;
        if (color) {
            item.el.style.setProperty('--tag-color', COLOR_MAP[color]);
            item.el.classList.add('has-color');
        } else {
            item.el.style.setProperty('--tag-color', 'transparent');
            item.el.classList.remove('has-color');
        }
        item.el.querySelectorAll('.color-opt').forEach(o =>
            o.classList.toggle('selected', o.dataset.color === (color || ''))
        );
        if (state.activeFilter !== 'all') {
            item.el.classList.toggle('filtered-out', item.color !== state.activeFilter);
        }
        // Update connections from this node
        state.connections.filter(c => c.from === item).forEach(updateConnectionFn);
    });
    throttledMinimap();
    saveStateFn();
    triggerAutoSaveFn();
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
    setTimeout(() => autoResizeItem(item), 10);
    saveStateFn();
    triggerAutoSaveFn();
}

// Auto-resize item based on content
export function autoResizeItem(item) {
    if (item.type !== 'memo') return;
    const memoBody = item.el.querySelector('.memo-body');
    if (!memoBody) return;

    let fontMultiplier = 1;
    if (item.fontSize === 'medium') fontMultiplier = 1.1;
    else if (item.fontSize === 'large') fontMultiplier = 1.25;
    else if (item.fontSize === 'xlarge') fontMultiplier = 1.4;

    // Measure content height
    const scrollH = memoBody.scrollHeight;

    // Memo layout: padding(12*2=24) + toolbar(32)
    const extraH = 24 + 32;

    const minH = Math.round(80 * fontMultiplier);
    const maxH = Math.round(500 * fontMultiplier);
    const newH = Math.min(Math.max(scrollH + extraH, minH), maxH);

    if (Math.abs(newH - item.h) > 4) {
        item.h = newH;
        item.el.style.height = item.h + 'px';
        updateAllConnectionsFn();
        throttledMinimap();
    }
}

// Select an item
export function selectItem(item, accumulate = false) {
    if (!accumulate) deselectAll();
    state.selectedItems.add(item);
    item.el.classList.add('selected');
    window.selectedItem = item;
}

// Deselect all items
export function deselectAll() {
    state.selectedItems.forEach(i => i.el.classList.remove('selected'));
    state.selectedItems.clear();
    window.selectedItem = null;

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
    $('filterDropdown').classList.remove('active');
    $('colorDropdown').classList.remove('active');
    $('connDirectionPicker').classList.remove('active');
    $('childTypePicker').classList.remove('active');
    $('canvasIconPicker').classList.remove('active');
    $('newNodePicker').classList.remove('active');
    state.setNewNodePickerData(null);
}

export { hideMenus };

// Delete selected items
export function deleteSelectedItems() {
    if (!state.selectedItems.size) return;
    saveStateFn();
    state.selectedItems.forEach(item => deleteItem(item, false));
    state.selectedItems.clear();
    throttledMinimap();
    triggerAutoSaveFn();
}

// Delete a single item
export function deleteItem(item, update = true) {
    state.connections.filter(c => c.from === item || c.to === item).forEach(c => deleteConnectionFn(c, false));

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

    const i = state.items.indexOf(item);
    if (i > -1) {
        state.items.splice(i, 1);
        item.el.remove();
    }

    if (update) {
        saveStateFn();
        throttledMinimap();
        triggerAutoSaveFn();
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
        fontSize: item.fontSize
    });
    saveStateFn();
    triggerAutoSaveFn();
}

// Calculate default height based on font size for memos
function getDefaultHeight(fontSize) {
    let fontMultiplier = 1;
    if (fontSize === 'medium') fontMultiplier = 1.1;
    else if (fontSize === 'large') fontMultiplier = 1.25;
    else if (fontSize === 'xlarge') fontMultiplier = 1.4;

    return Math.round(80 * fontMultiplier);
}

// Add memo
export function addMemo(text = '', x, y, color = null) {
    const pos = findFreePosition(x, y, state.items);
    // Apply default font size setting
    const fontSize = state.defaultFontSize !== 'small' ? state.defaultFontSize : null;
    const defaultH = getDefaultHeight(fontSize);
    const item = createItem({
        type: 'memo',
        x: pos.x,
        y: pos.y,
        w: 180,
        h: defaultH,
        content: text,
        color,
        fontSize
    });
    triggerAutoSaveFn();
    return item;
}

// Add link
export function addLink(url, title, x, y) {
    const domain = new URL(url).hostname;
    const item = createItem({
        type: 'link',
        x,
        y,
        w: 260,
        h: 100,
        content: {
            url,
            title: title || domain,
            display: url.replace(/^https?:\/\//, '').replace(/\/$/, '')
        }
    });
    triggerAutoSaveFn();
    return item;
}

// Set filter
export function setFilter(color) {
    state.setActiveFilter(color);
    $('filterDropdown').querySelectorAll('.filter-opt').forEach(o =>
        o.classList.toggle('selected', o.dataset.color === color)
    );
    $('filterBtn').classList.toggle('filter-active', color !== 'all');
    state.items.forEach(item =>
        item.el.classList.toggle('filtered-out', color !== 'all' && item.color !== color)
    );
    throttledMinimap();
}
