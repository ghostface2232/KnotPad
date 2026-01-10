// KnotPad - Items Module (Create, Manage, Delete)

import { COLORS, COLOR_MAP, FONT_SIZES } from './constants.js';
import { $, esc, findFreePosition } from './utils.js';
import * as state from './state.js';
import { throttledMinimap, updateMinimap } from './viewport.js';
import { deleteMedia, deleteMediaFromFileSystem, fsDirectoryHandle } from './storage.js';
import eventBus, { Events } from './events-bus.js';

const canvas = $('canvas');

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
            html = `<div class="item-memo"><div class="memo-body" contenteditable="true" spellcheck="false" data-placeholder="Write something...">${parseContent(cfg.content || '')}</div></div>`;
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

    const isMemo = cfg.type === 'memo';
    const fontSizeBtn = isMemo
        ? `<button class="font-size-btn" title="Font Size"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg></button>`
        : '';
    const memoToolbar = isMemo
        ? `<div class="memo-toolbar"><button class="md-btn" data-md="heading" title="Heading"><svg width="14" height="17" viewBox="0 0 27 34" fill="currentColor"><path d="M2.07 33.82c-1.26 0-2.07-.83-2.07-2.14V2.14C0 .83.8 0 2.07 0c1.26 0 2.07.83 2.07 2.14v12.53h18.2V2.14c0-1.31.81-2.14 2.07-2.14 1.27 0 2.07.83 2.07 2.14v29.54c0 1.31-.8 2.14-2.07 2.14-1.26 0-2.07-.83-2.07-2.14V18.39H4.14v13.29c0 1.31-.81 2.14-2.07 2.14z"/></svg></button><button class="md-btn" data-md="bold" title="Bold"><svg width="13" height="17" viewBox="0 0 25 33" fill="currentColor"><path d="M2.9 32.49C1.1 32.49 0 31.37 0 29.48V3.02C0 1.13 1.1 0 2.9 0h10.59c5.9 0 9.7 3.18 9.7 8.11 0 3.49-2.59 6.53-5.92 7.07v.18c4.41.43 7.5 3.6 7.5 7.9 0 5.72-4.21 9.23-11.15 9.23H2.9zM5.81 13.69h5.31c4.05 0 6.33-1.71 6.33-4.73 0-2.84-1.96-4.44-5.43-4.44H5.81v9.17zm0 14.28h6.49c4.28 0 6.55-1.78 6.55-5.11 0-3.31-2.34-5.05-6.8-5.05H5.81v10.16z"/></svg></button><button class="md-btn" data-md="italic" title="Italic"><svg width="13" height="17" viewBox="0 0 25 34" fill="currentColor"><path d="M1.85156 33.8203C0.75 33.8203 0 33.0703 0 32.0156C0 30.9609 0.75 30.2109 1.85156 30.2109H6.75L13.75 3.60938H8.85156C7.75 3.60938 7 2.85938 7 1.80469C7 0.75 7.75 0 8.85156 0H22.7734C23.8984 0 24.7188 0.703125 24.7188 1.80469C24.7188 2.90625 23.8984 3.60938 22.7734 3.60938H17.9688L10.9688 30.2109H15.7734C16.8984 30.2109 17.7188 30.9141 17.7188 32.0156C17.7188 33.1172 16.8984 33.8203 15.7734 33.8203H1.85156Z"/></svg></button><button class="md-btn" data-md="strike" title="Strikethrough"><svg width="18" height="18" viewBox="0 0 35 35" fill="currentColor"><path d="M17.5 0c5.65 0 10.2 2.84 11.42 7.41.07.26.12.61.12 1.05 0 1.15-.8 1.9-1.92 1.9-1.08 0-1.74-.56-2.11-1.64-1.17-3.42-3.96-4.92-7.62-4.92-4.22 0-7.48 2.06-7.48 5.51 0 2.67 1.81 4.5 6.42 5.51l3.75.82c.13.03.26.06.39.09h12.76a1.75 1.75 0 110 3.5h-5.35c1.41 1.46 2.07 3.28 2.07 5.55 0 6.26-4.92 10.17-12.5 10.17-6.35 0-10.87-2.86-12.14-6.94-.14-.47-.23-.98-.23-1.48 0-1.34.75-2.18 1.95-2.18 1.05 0 1.71.54 2.04 1.67 1.03 3.49 4.36 5.13 8.62 5.13 4.59 0 7.92-2.41 7.92-5.74 0-2.84-1.87-4.71-6.56-5.74l-2.02-.44H1.75a1.75 1.75 0 110-3.5h6.47c-1.81-1.6-2.64-3.67-2.64-6.23 0-5.58 4.92-9.49 12.01-9.49z"/></svg></button><button class="md-btn" data-md="underline" title="Underline"><svg width="16" height="19" viewBox="0 0 31 36" fill="currentColor"><path d="M15.18 30.71C6.79 30.71 1.75 25.51 1.75 18.29V2.18C1.75.84 2.57 0 3.86 0s2.11.84 2.11 2.18v15.83c0 5.11 3.35 8.81 9.21 8.81s9.21-3.7 9.21-8.81V2.18C24.39.84 25.21 0 26.5 0s2.11.84 2.11 2.18v16.11c0 7.22-5.04 12.42-13.43 12.42z"/><path d="M28.61 32.4a1.75 1.75 0 110 3.5H1.75a1.75 1.75 0 110-3.5h26.86z"/></svg></button></div>`
        : '';

    if (!isMemo) {
        el.classList.add('no-font-btn');
    }

    el.innerHTML = `<div class="color-dot"></div><div class="item-content">${html}</div><button class="delete-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>${fontSizeBtn}<button class="color-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="7.5" r="2" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12.5" r="2" fill="currentColor" stroke="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"/></svg></button><div class="color-picker"><div class="color-opt none" data-color="" title="None"></div>${COLORS.map(c => `<div class="color-opt" data-color="${c}" style="background:${COLOR_MAP[c]}" title="${c}"></div>`).join('')}</div><div class="resize-handle"></div><div class="connection-handle top" data-h="top"></div><div class="connection-handle bottom" data-h="bottom"></div><div class="connection-handle left" data-h="left"></div><div class="connection-handle right" data-h="right"></div><button class="add-child-btn top" data-d="top">+</button><button class="add-child-btn bottom" data-d="bottom">+</button><button class="add-child-btn left" data-d="left">+</button><button class="add-child-btn right" data-d="right">+</button>${memoToolbar}`;

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
    }

    setTimeout(() => el.classList.remove('new'), 200);
    return item;
}

// Setup event handlers for an item
function setupItemEvents(item) {
    const el = item.el;

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
            t.tagName === 'VIDEO' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
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
            eventBus.emit(Events.UI_SHOW_CHILD_TYPE_PICKER, item, btn.dataset.d, e);
        });
    });

    el.querySelectorAll('.connection-handle').forEach(h => {
        h.addEventListener('mousedown', e => {
            e.stopPropagation();
            if (state.connectSource) {
                eventBus.emit(Events.CONNECTIONS_COMPLETE, item, h.dataset.h);
            } else {
                eventBus.emit(Events.CONNECTIONS_START, item, h.dataset.h);
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

        // In connecting mode, right-click cancels the connection
        if (state.connectSource) {
            eventBus.emit(Events.CONNECTIONS_CANCEL, true); // with fade effect
            return;
        }

        if (!state.selectedItems.has(item)) selectItem(item);
        eventBus.emit(Events.UI_SHOW_CONTEXT_MENU, e.clientX, e.clientY, item);
    });

    if (item.type === 'memo') {
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

            const mbRect = mb.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;

            // Check if click is outside memo-body (in padding/border area)
            const isInPaddingArea = x < mbRect.left || x > mbRect.right ||
                                    y < mbRect.top || y > mbRect.bottom;

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
                } else {
                    selectItem(item, false);
                }

                // Setup drag if not locked
                if (!item.locked) {
                    const rect = el.getBoundingClientRect();
                    item.ox = (e.clientX - rect.left) / state.scale;
                    item.oy = (e.clientY - rect.top) / state.scale;
                    state.setDraggedItem(item);
                    state.selectedItems.forEach(i => i.el.classList.add('dragging'));
                    canvas.classList.add('dragging-item');
                }
            }
        });

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
        });

        // Handle input - save content and auto-resize
        mb.addEventListener('input', () => {
            item.content = getHtmlContent(mb);
            autoResizeItem(item);
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
        });

        // Handle blur - hide toolbar and save state if changed
        mb.addEventListener('blur', () => {
            el.classList.remove('editing');
            toolbar.classList.remove('active');
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
        });

        // Show toolbar on focus and record current state for undo
        mb.addEventListener('focus', () => {
            el.classList.add('editing');
            toolbar.classList.add('active');
            // Record content before editing starts
            contentBeforeEdit = item.content;
            hasUnsavedChanges = false;
        });

        // Block image paste in memo and strip text/background colors
        mb.addEventListener('paste', e => {
            const cd = e.clipboardData;
            if (!cd) return;

            // Check if clipboard contains images - block them
            for (let i = 0; i < cd.items.length; i++) {
                if (cd.items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    return;
                }
            }

            // Process HTML to remove text color and background color
            const html = cd.getData('text/html');
            if (html) {
                e.preventDefault();
                // Parse HTML and strip color styles
                const temp = document.createElement('div');
                temp.innerHTML = html;

                // Convert ordered lists to text-based numbering to preserve numbers correctly
                temp.querySelectorAll('ol').forEach(ol => {
                    const startNum = parseInt(ol.getAttribute('start'), 10) || 1;
                    const items = ol.querySelectorAll(':scope > li');
                    items.forEach((li, index) => {
                        // Check if li has explicit value attribute
                        const liValue = li.getAttribute('value');
                        const num = liValue ? parseInt(liValue, 10) : startNum + index;
                        // Prepend the number to the list item content
                        li.innerHTML = num + '. ' + li.innerHTML;
                    });
                    // Convert ol to div to remove list styling
                    const div = document.createElement('div');
                    div.innerHTML = ol.innerHTML;
                    ol.replaceWith(div);
                });

                // Convert unordered lists to text-based format
                temp.querySelectorAll('ul').forEach(ul => {
                    const items = ul.querySelectorAll(':scope > li');
                    items.forEach(li => {
                        li.innerHTML = '- ' + li.innerHTML;
                    });
                    // Convert ul to div
                    const div = document.createElement('div');
                    div.innerHTML = ul.innerHTML;
                    ul.replaceWith(div);
                });

                // Convert remaining li elements to div with line break
                temp.querySelectorAll('li').forEach(li => {
                    const div = document.createElement('div');
                    div.innerHTML = li.innerHTML;
                    li.replaceWith(div);
                });

                temp.querySelectorAll('*').forEach(el => {
                    el.style.color = '';
                    el.style.backgroundColor = '';
                    el.style.background = '';
                    // Also remove color attribute
                    el.removeAttribute('color');
                    el.removeAttribute('bgcolor');
                });
                document.execCommand('insertHTML', false, temp.innerHTML);
            }
            // Plain text falls through to default behavior
        });

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
        });

        // Markdown toolbar buttons - simple toggle with execCommand
        toolbar.querySelectorAll('.md-btn').forEach(btn => {
            btn.addEventListener('mousedown', e => {
                e.preventDefault(); // Prevent blur
            });
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
                }

                item.content = getHtmlContent(mb);
                autoResizeItem(item);
                eventBus.emit(Events.AUTOSAVE_TRIGGER);
                hasUnsavedChanges = true;

                // Save to undo stack immediately for formatting changes
                if (item.content !== contentBeforeEdit) {
                    eventBus.emit(Events.STATE_SAVE);
                    contentBeforeEdit = item.content;
                    hasUnsavedChanges = false;
                }
            });
        });
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
        } else {
            item.el.style.setProperty('--tag-color', 'transparent');
            item.el.classList.remove('has-color');
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
        }
        // Update connections from this node
        state.connections.filter(c => c.from === item).forEach(c => eventBus.emit(Events.CONNECTIONS_UPDATE, c));
    });
    throttledMinimap();
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
    setTimeout(() => autoResizeItem(item), 10);
    eventBus.emit(Events.STATE_SAVE);
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

// Auto-resize item based on content - fit to content height
export function autoResizeItem(item) {
    if (item.type !== 'memo') return;
    // Skip auto-resize if user manually resized
    if (item.manuallyResized) return;

    const memoBody = item.el.querySelector('.memo-body');
    if (!memoBody) return;

    let fontMultiplier = 1;
    if (item.fontSize === 'medium') fontMultiplier = 1.15;
    else if (item.fontSize === 'large') fontMultiplier = 1.4;
    else if (item.fontSize === 'xlarge') fontMultiplier = 1.7;

    // Get minimum and maximum height based on font size
    const minH = Math.round(120 * fontMultiplier);
    const maxH = Math.round(500 * fontMultiplier);

    // Get line height for line-based change detection
    const style = window.getComputedStyle(memoBody);
    const lineHeight = parseFloat(style.lineHeight) || 20;

    // Use scrollHeight to measure actual content including word-wrap
    const contentH = memoBody.scrollHeight;

    // Memo layout: padding(12*2=24) + toolbar(~38) + buffer(3)
    const extraH = 24 + 38 + 3;

    // Calculate new height - fit to content within min/max bounds
    const targetH = contentH + extraH;
    const newH = Math.max(minH, Math.min(targetH, maxH));

    // Only update if change is at least half a line (prevents jitter)
    if (Math.abs(newH - item.h) >= lineHeight / 2) {
        item.h = newH;
        item.el.style.height = item.h + 'px';
        eventBus.emit(Events.CONNECTIONS_UPDATE_ALL);
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
    eventBus.emit(Events.STATE_SAVE);
    state.selectedItems.forEach(item => deleteItem(item, false));
    state.selectedItems.clear();
    throttledMinimap();
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

// Delete a single item
export function deleteItem(item, update = true, withFade = true) {
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
        fontSize: item.fontSize
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
        fontSize: item.fontSize
    });
}

// Calculate default height based on font size for memos
function getDefaultHeight(fontSize) {
    let fontMultiplier = 1;
    if (fontSize === 'medium') fontMultiplier = 1.15;
    else if (fontSize === 'large') fontMultiplier = 1.4;
    else if (fontSize === 'xlarge') fontMultiplier = 1.7;

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
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
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
    throttledMinimap();
}

// Sort items by color tag and arrange in grid
export function sortByColor() {
    if (state.items.length === 0) return;

    // Color order: red, orange, yellow, green, blue, purple, pink, then no color (null)
    const colorOrder = [...COLORS, null];

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
    // Connected items should be placed closer together
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
            // Add connected items next
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

    // Calculate layout parameters
    const horizontalGap = 48; // Horizontal spacing between columns
    const verticalGap = 24;   // Vertical spacing between items (smaller since same color)

    // Get active colors (colors that have items)
    const activeColors = colorOrder.filter(c => {
        const key = c === null ? 'none' : c;
        return groups[key].length > 0;
    });

    // Calculate max width and total height for each column
    const columnData = activeColors.map(color => {
        const key = color === null ? 'none' : color;
        const items = groups[key];
        const maxWidth = Math.max(...items.map(item => item.w));
        const totalHeight = items.reduce((sum, item, idx) => {
            return sum + item.h + (idx < items.length - 1 ? verticalGap : 0);
        }, 0);
        return { color, key, items, maxWidth, totalHeight };
    });

    // Calculate total width and max column height
    const totalWidth = columnData.reduce((sum, col, idx) => {
        return sum + col.maxWidth + (idx < columnData.length - 1 ? horizontalGap : 0);
    }, 0);
    const maxColumnHeight = Math.max(...columnData.map(col => col.totalHeight));

    // Find the visible area center (don't change viewport, just calculate center point)
    const viewCenterX = (innerWidth / 2 - state.offsetX) / state.scale;
    const viewCenterY = (innerHeight / 2 - state.offsetY) / state.scale;

    // Calculate start position to center the grid
    const startX = viewCenterX - totalWidth / 2;
    const startY = viewCenterY - maxColumnHeight / 2;

    // Place items in columns by color - columns top-aligned, items horizontally centered
    let currentX = startX;
    columnData.forEach(col => {
        let currentY = startY;

        col.items.forEach(item => {
            // Center each item horizontally within the column
            const itemOffsetX = (col.maxWidth - item.w) / 2;
            item.x = currentX + itemOffsetX;
            item.y = currentY;
            item.el.style.left = item.x + 'px';
            item.el.style.top = item.y + 'px';
            currentY += item.h + verticalGap;
        });
        currentX += col.maxWidth + horizontalGap;
    });

    eventBus.emit(Events.CONNECTIONS_UPDATE_ALL);
    updateMinimap();
    eventBus.emit(Events.STATE_SAVE);
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}
