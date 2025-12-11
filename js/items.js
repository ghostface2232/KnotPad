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

// Real-time markdown conversion (Notion-style)
// Converts markdown syntax as you type
function applyRealtimeMarkdown(el, item) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return false;

    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;

    // Get the current text node and its content
    let node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;

    const text = node.textContent;
    const cursorPos = range.startOffset;

    // Check for inline patterns ending at cursor
    // Bold: **text**
    const boldMatch = text.slice(0, cursorPos).match(/\*\*(.+?)\*\*$/);
    if (boldMatch) {
        const fullMatch = boldMatch[0];
        const content = boldMatch[1];
        const startPos = cursorPos - fullMatch.length;

        // Create the replacement
        const before = text.slice(0, startPos);
        const after = text.slice(cursorPos);

        const strong = document.createElement('strong');
        strong.textContent = content;

        // Replace the text
        const beforeNode = document.createTextNode(before);
        const afterNode = document.createTextNode(after || '\u200B'); // Zero-width space if empty

        const parent = node.parentNode;
        parent.insertBefore(beforeNode, node);
        parent.insertBefore(strong, node);
        parent.insertBefore(afterNode, node);
        parent.removeChild(node);

        // Set cursor after the strong element
        const newRange = document.createRange();
        newRange.setStart(afterNode, afterNode.textContent === '\u200B' ? 1 : 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        return true;
    }

    // Strikethrough: ~~text~~
    const strikeMatch = text.slice(0, cursorPos).match(/~~(.+?)~~$/);
    if (strikeMatch) {
        const fullMatch = strikeMatch[0];
        const content = strikeMatch[1];
        const startPos = cursorPos - fullMatch.length;

        const before = text.slice(0, startPos);
        const after = text.slice(cursorPos);

        const del = document.createElement('del');
        del.textContent = content;

        const beforeNode = document.createTextNode(before);
        const afterNode = document.createTextNode(after || '\u200B');

        const parent = node.parentNode;
        parent.insertBefore(beforeNode, node);
        parent.insertBefore(del, node);
        parent.insertBefore(afterNode, node);
        parent.removeChild(node);

        const newRange = document.createRange();
        newRange.setStart(afterNode, afterNode.textContent === '\u200B' ? 1 : 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        return true;
    }

    // Underline: __text__
    const underlineMatch = text.slice(0, cursorPos).match(/__(.+?)__$/);
    if (underlineMatch) {
        const fullMatch = underlineMatch[0];
        const content = underlineMatch[1];
        const startPos = cursorPos - fullMatch.length;

        const before = text.slice(0, startPos);
        const after = text.slice(cursorPos);

        const u = document.createElement('u');
        u.textContent = content;

        const beforeNode = document.createTextNode(before);
        const afterNode = document.createTextNode(after || '\u200B');

        const parent = node.parentNode;
        parent.insertBefore(beforeNode, node);
        parent.insertBefore(u, node);
        parent.insertBefore(afterNode, node);
        parent.removeChild(node);

        const newRange = document.createRange();
        newRange.setStart(afterNode, afterNode.textContent === '\u200B' ? 1 : 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        return true;
    }

    return false;
}

// Check and apply block-level markdown (headings, lists, etc.) on Enter
function applyBlockMarkdown(el, item) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return false;

    const range = sel.getRangeAt(0);

    // Find the current block/line
    let blockNode = range.startContainer;
    while (blockNode && blockNode !== el && !['DIV', 'P', 'H1', 'H2', 'H3', 'LI', 'BLOCKQUOTE'].includes(blockNode.nodeName)) {
        blockNode = blockNode.parentNode;
    }

    if (!blockNode || blockNode === el) {
        // We're at root level, check text directly
        blockNode = range.startContainer;
        if (blockNode.nodeType !== Node.TEXT_NODE) return false;
    }

    const text = blockNode.textContent;

    // Heading: # text, ## text, ### text (at start of line)
    const h3Match = text.match(/^### (.+)$/);
    if (h3Match) {
        const h3 = document.createElement('h3');
        h3.textContent = h3Match[1];
        blockNode.parentNode.replaceChild(h3, blockNode);
        placeCaretAtEnd(h3);
        return true;
    }

    const h2Match = text.match(/^## (.+)$/);
    if (h2Match) {
        const h2 = document.createElement('h2');
        h2.textContent = h2Match[1];
        blockNode.parentNode.replaceChild(h2, blockNode);
        placeCaretAtEnd(h2);
        return true;
    }

    const h1Match = text.match(/^# (.+)$/);
    if (h1Match) {
        const h1 = document.createElement('h1');
        h1.textContent = h1Match[1];
        blockNode.parentNode.replaceChild(h1, blockNode);
        placeCaretAtEnd(h1);
        return true;
    }

    // Blockquote: > text
    const bqMatch = text.match(/^> (.+)$/);
    if (bqMatch) {
        const bq = document.createElement('blockquote');
        bq.textContent = bqMatch[1];
        blockNode.parentNode.replaceChild(bq, blockNode);
        placeCaretAtEnd(bq);
        return true;
    }

    // Unordered list: - text
    const ulMatch = text.match(/^- (.+)$/);
    if (ulMatch) {
        const ul = document.createElement('ul');
        const li = document.createElement('li');
        li.textContent = ulMatch[1];
        ul.appendChild(li);
        blockNode.parentNode.replaceChild(ul, blockNode);
        placeCaretAtEnd(li);
        return true;
    }

    // Ordered list: 1. text
    const olMatch = text.match(/^\d+\. (.+)$/);
    if (olMatch) {
        const ol = document.createElement('ol');
        const li = document.createElement('li');
        li.textContent = olMatch[1];
        ol.appendChild(li);
        blockNode.parentNode.replaceChild(ol, blockNode);
        placeCaretAtEnd(li);
        return true;
    }

    // Horizontal rule: ---
    if (text.trim() === '---') {
        const hr = document.createElement('hr');
        const br = document.createElement('br');
        blockNode.parentNode.replaceChild(hr, blockNode);
        hr.parentNode.insertBefore(br, hr.nextSibling);
        return true;
    }

    return false;
}

// Helper to place caret at end of element
function placeCaretAtEnd(el) {
    const range = document.createRange();
    const sel = window.getSelection();
    if (el.lastChild) {
        if (el.lastChild.nodeType === Node.TEXT_NODE) {
            range.setStart(el.lastChild, el.lastChild.length);
        } else {
            range.selectNodeContents(el);
            range.collapse(false);
        }
    } else {
        range.selectNodeContents(el);
        range.collapse(false);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

// Get content as markdown from HTML (for storage)
function getMarkdownFromHtml(el) {
    let result = '';

    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            // Clean up zero-width spaces
            result += node.textContent.replace(/\u200B/g, '');
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;

            switch (tag) {
                case 'H1':
                    result += '# ' + node.textContent;
                    break;
                case 'H2':
                    result += '## ' + node.textContent;
                    break;
                case 'H3':
                    result += '### ' + node.textContent;
                    break;
                case 'STRONG':
                case 'B':
                    result += '**' + node.textContent + '**';
                    break;
                case 'DEL':
                case 'S':
                    result += '~~' + node.textContent + '~~';
                    break;
                case 'U':
                    result += '__' + node.textContent + '__';
                    break;
                case 'BLOCKQUOTE':
                    result += '> ' + node.textContent;
                    break;
                case 'LI':
                    const parent = node.parentNode;
                    if (parent && parent.tagName === 'OL') {
                        const index = Array.from(parent.children).indexOf(node) + 1;
                        result += index + '. ' + node.textContent;
                    } else {
                        result += '- ' + node.textContent;
                    }
                    break;
                case 'HR':
                    result += '---';
                    break;
                case 'BR':
                    result += '\n';
                    break;
                case 'UL':
                case 'OL':
                    node.childNodes.forEach(child => {
                        processNode(child);
                        if (child !== node.lastChild) result += '\n';
                    });
                    break;
                case 'DIV':
                case 'P':
                    if (result && !result.endsWith('\n')) result += '\n';
                    node.childNodes.forEach(processNode);
                    break;
                default:
                    node.childNodes.forEach(processNode);
            }
        }
    }

    el.childNodes.forEach((node, i) => {
        processNode(node);
        // Add newline between block elements
        if (i < el.childNodes.length - 1 && node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            if (['H1', 'H2', 'H3', 'BLOCKQUOTE', 'HR', 'UL', 'OL', 'DIV', 'P'].includes(tag)) {
                if (!result.endsWith('\n')) result += '\n';
            }
        }
    });

    return result.replace(/\n{3,}/g, '\n\n').trim();
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
            html = `<div class="item-memo"><div class="memo-body" contenteditable="true" data-placeholder="Write something...">${parseMarkdown(cfg.content || '')}</div><div class="memo-toolbar"><button class="md-btn" data-md="heading" title="Heading"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h12M6 4v16M18 4v16"/></svg></button><button class="md-btn" data-md="bold" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5h6a3.5 3.5 0 010 7H7z"/><path d="M7 12h7a3.5 3.5 0 010 7H7z"/><path d="M7 5v14"/></svg></button><button class="md-btn" data-md="strike" title="Strikethrough"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/><path d="M4 12h16"/></svg></button><button class="md-btn" data-md="underline" title="Underline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0012 0V4"/><path d="M4 20h16"/></svg></button></div></div>`;
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
        // Skip drag for interactive elements and contenteditable
        if (t.classList.contains('delete-btn') || t.classList.contains('resize-handle') ||
            t.classList.contains('connection-handle') || t.classList.contains('add-child-btn') ||
            t.classList.contains('color-btn') || t.classList.contains('font-size-btn') ||
            t.classList.contains('color-opt') || t.closest('.color-picker') ||
            t.tagName === 'VIDEO' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
            t.closest('[contenteditable="true"]') || t.classList.contains('memo-body')) {
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

        // Handle input - real-time markdown conversion
        mb.addEventListener('input', () => {
            // Try to apply real-time inline markdown (bold, strike, underline)
            applyRealtimeMarkdown(mb, item);

            // Save content as markdown
            item.content = getMarkdownFromHtml(mb);
            autoResizeItem(item);
            triggerAutoSaveFn();
        });

        // Handle keydown for block-level markdown (Enter key)
        mb.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                // Check if current line has block markdown syntax
                const applied = applyBlockMarkdown(mb, item);
                if (applied) {
                    e.preventDefault();
                    item.content = getMarkdownFromHtml(mb);
                    autoResizeItem(item);
                    triggerAutoSaveFn();
                }
            }
        });

        // Handle blur - just hide toolbar, keep rendered state
        mb.addEventListener('blur', () => {
            toolbar.classList.remove('active');
            // Clean up any zero-width spaces
            mb.innerHTML = mb.innerHTML.replace(/\u200B/g, '');
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

// Apply markdown formatting via toolbar buttons
function applyMarkdown(el, type, item) {
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return;

    switch (type) {
        case 'heading':
            applyHeadingFromToolbar(el, item);
            break;
        case 'bold':
            wrapSelectionWithTag(el, 'strong');
            break;
        case 'strike':
            wrapSelectionWithTag(el, 'del');
            break;
        case 'underline':
            wrapSelectionWithTag(el, 'u');
            break;
    }

    item.content = getMarkdownFromHtml(el);
    autoResizeItem(item);
    triggerAutoSaveFn();
}

// Apply heading from toolbar button
function applyHeadingFromToolbar(el, item) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    let node = range.startContainer;

    // Find the current block element
    while (node && node !== el && !['H1', 'H2', 'H3', 'DIV', 'P'].includes(node.nodeName)) {
        node = node.parentNode;
    }

    if (!node || node === el) {
        // Text at root level - wrap in h1
        const text = range.startContainer.textContent || '';
        const h1 = document.createElement('h1');
        h1.textContent = text;
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
            range.startContainer.parentNode.replaceChild(h1, range.startContainer);
        }
        placeCaretAtEnd(h1);
        return;
    }

    // Cycle through heading levels
    const tag = node.nodeName;
    let newEl;

    if (tag === 'H3') {
        // H3 -> plain text (DIV)
        newEl = document.createElement('div');
    } else if (tag === 'H2') {
        newEl = document.createElement('h3');
    } else if (tag === 'H1') {
        newEl = document.createElement('h2');
    } else {
        // DIV/P -> H1
        newEl = document.createElement('h1');
    }

    newEl.innerHTML = node.innerHTML;
    node.parentNode.replaceChild(newEl, node);
    placeCaretAtEnd(newEl);
}

// Wrap selection with HTML tag
function wrapSelectionWithTag(el, tagName) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const text = range.toString();

    if (text) {
        // Check if already wrapped with this tag - if so, unwrap
        const parent = range.commonAncestorContainer.parentElement;
        if (parent && parent.tagName === tagName.toUpperCase()) {
            // Unwrap - replace the tag with its text content
            const textNode = document.createTextNode(parent.textContent);
            parent.parentNode.replaceChild(textNode, parent);
            // Select the text node
            const newRange = document.createRange();
            newRange.selectNodeContents(textNode);
            sel.removeAllRanges();
            sel.addRange(newRange);
        } else {
            // Wrap selection with the tag
            const wrapper = document.createElement(tagName);
            range.surroundContents(wrapper);
            // Place cursor after
            const newRange = document.createRange();
            newRange.setStartAfter(wrapper);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
    } else {
        // No selection - insert empty tag and place cursor inside
        const wrapper = document.createElement(tagName);
        wrapper.textContent = '\u200B'; // Zero-width space
        range.insertNode(wrapper);
        const newRange = document.createRange();
        newRange.setStart(wrapper.firstChild, 1);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
    }
}

// Wrap selection with markers (legacy - kept for compatibility)
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

// Auto-resize item based on content - fit to content height
export function autoResizeItem(item) {
    if (item.type !== 'memo') return;
    const memoBody = item.el.querySelector('.memo-body');
    if (!memoBody) return;

    let fontMultiplier = 1;
    if (item.fontSize === 'medium') fontMultiplier = 1.1;
    else if (item.fontSize === 'large') fontMultiplier = 1.25;
    else if (item.fontSize === 'xlarge') fontMultiplier = 1.4;

    // Get minimum and maximum height based on font size
    const minH = Math.round(80 * fontMultiplier);
    const maxH = Math.round(500 * fontMultiplier);

    // Temporarily reset height to measure true content height
    const originalHeight = memoBody.style.height;
    memoBody.style.height = 'auto';

    // Measure actual content height
    const contentH = memoBody.scrollHeight;

    // Restore height
    memoBody.style.height = originalHeight;

    // Memo layout: padding(12*2=24) + toolbar(~38)
    const extraH = 24 + 38;

    // Calculate new height - fit to content within min/max bounds
    const targetH = contentH + extraH;
    const newH = Math.max(minH, Math.min(targetH, maxH));

    // Only update if there's a meaningful change (avoid micro-adjustments)
    if (Math.abs(newH - item.h) > 2) {
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
    $('canvasIconPicker').classList.remove('active');
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

    return Math.round(120 * fontMultiplier);
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
