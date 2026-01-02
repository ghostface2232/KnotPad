// KnotPad - Canvas Event Delegation Module
// Centralizes event handling for canvas items to improve performance

import { $ } from './utils.js';
import * as state from './state.js';
import { setItemColor, setItemFontSize, selectItem, deleteItem, deleteSelectedItems, deselectAll, autoResizeItem } from './items.js';
import { throttledMinimap } from './viewport.js';
import eventBus, { Events } from './events-bus.js';

const canvas = $('canvas');

// Map to store per-item memo state (contentBeforeEdit, hasUnsavedChanges, etc.)
const memoStateMap = new WeakMap();

/**
 * Get item from state.items by its ID
 * @param {string} itemId - The item's ID
 * @returns {Object|null} The item object or null
 */
function getItemById(itemId) {
    return state.items.find(i => i.id === itemId) || null;
}

/**
 * Get item from a DOM element by traversing up to find data-item-id
 * @param {HTMLElement} element - The target element
 * @returns {Object|null} The item object or null
 */
function getItemFromElement(element) {
    const itemEl = element.closest('.canvas-item');
    if (!itemEl || !itemEl.dataset.itemId) return null;
    return getItemById(itemEl.dataset.itemId);
}

/**
 * Initialize or get memo state for an item
 * @param {Object} item - The item object
 * @returns {Object} The memo state object
 */
function getMemoState(item) {
    if (!memoStateMap.has(item)) {
        memoStateMap.set(item, {
            contentBeforeEdit: item.content,
            hasUnsavedChanges: false,
            undoSaveTimer: null
        });
    }
    return memoStateMap.get(item);
}

/**
 * Clean up memo state when an item is deleted
 * @param {Object} item - The item object
 */
export function cleanupMemoState(item) {
    const memoState = memoStateMap.get(item);
    if (memoState && memoState.undoSaveTimer) {
        clearTimeout(memoState.undoSaveTimer);
    }
    memoStateMap.delete(item);
}

/**
 * Toggle heading (cycle through H1 -> H2 -> H3 -> normal)
 * @param {HTMLElement} el - The contenteditable element
 */
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

/**
 * Get HTML content from contenteditable element
 * @param {HTMLElement} el - The contenteditable element
 * @returns {string} The HTML content
 */
function getHtmlContent(el) {
    return el.innerHTML;
}

// ============ Event Handlers ============

/**
 * Handle click events on canvas items (delegated)
 */
function handleCanvasClick(e) {
    const target = e.target;
    const item = getItemFromElement(target);
    if (!item) return;

    // Delete button
    if (target.closest('.delete-btn')) {
        e.stopPropagation();
        if (state.selectedItems.has(item)) {
            deleteSelectedItems();
        } else {
            deleteItem(item);
        }
        return;
    }

    // Color button
    if (target.closest('.color-btn')) {
        e.stopPropagation();
        const colorPicker = item.el.querySelector('.color-picker');
        document.querySelectorAll('.color-picker.active').forEach(p => {
            if (p !== colorPicker) p.classList.remove('active');
        });
        colorPicker.classList.toggle('active');
        colorPicker.querySelectorAll('.color-opt').forEach(o =>
            o.classList.toggle('selected', o.dataset.color === (item.color || ''))
        );
        return;
    }

    // Color option
    if (target.closest('.color-opt')) {
        const opt = target.closest('.color-opt');
        const colorPicker = opt.closest('.color-picker');
        if (colorPicker && colorPicker.closest('.canvas-item')) {
            e.stopPropagation();
            setItemColor(item, opt.dataset.color || null);
            colorPicker.classList.remove('active');
        }
        return;
    }

    // Font size button
    if (target.closest('.font-size-btn')) {
        e.stopPropagation();
        setItemFontSize(item);
        return;
    }

    // Add child button
    if (target.closest('.add-child-btn')) {
        e.stopPropagation();
        const btn = target.closest('.add-child-btn');
        eventBus.emit(Events.UI_SHOW_CHILD_TYPE_PICKER, item, btn.dataset.d, e);
        return;
    }

    // Markdown toolbar buttons
    if (target.closest('.md-btn')) {
        const btn = target.closest('.md-btn');
        e.stopPropagation();
        const mb = item.el.querySelector('.memo-body');
        if (!mb) return;

        mb.focus();
        const md = btn.dataset.md;
        const memoState = getMemoState(item);

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
        memoState.hasUnsavedChanges = true;

        // Save to undo stack immediately for formatting changes
        if (item.content !== memoState.contentBeforeEdit) {
            eventBus.emit(Events.STATE_SAVE);
            memoState.contentBeforeEdit = item.content;
            memoState.hasUnsavedChanges = false;
        }
        return;
    }
}

/**
 * Handle mousedown events on canvas items (delegated)
 */
function handleCanvasMousedown(e) {
    const target = e.target;
    const item = getItemFromElement(target);
    if (!item) return;

    // Connection handle
    if (target.closest('.connection-handle')) {
        const h = target.closest('.connection-handle');
        e.stopPropagation();
        if (state.connectSource) {
            eventBus.emit(Events.CONNECTIONS_COMPLETE, item, h.dataset.h);
        } else {
            eventBus.emit(Events.CONNECTIONS_START, item, h.dataset.h);
        }
        return;
    }

    // Resize handle
    if (target.closest('.resize-handle')) {
        if (item.locked) return;
        e.stopPropagation();
        state.setResizingItem(item);
        return;
    }

    // Markdown toolbar button - prevent blur
    if (target.closest('.md-btn')) {
        e.preventDefault();
        return;
    }

    // Item memo padding area click (for selecting node instead of focusing text)
    const itemMemo = target.closest('.item-memo');
    if (itemMemo && e.button === 0) {
        const mb = itemMemo.querySelector('.memo-body');
        if (mb) {
            const mbRect = mb.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;

            // Check if click is outside memo-body (in padding/border area)
            const isInPaddingArea = x < mbRect.left || x > mbRect.right ||
                                    y < mbRect.top || y > mbRect.bottom;

            if (isInPaddingArea) {
                e.preventDefault();
                e.stopPropagation();

                // Bring item to top
                item.el.style.zIndex = state.incrementHighestZ();

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
                    const rect = item.el.getBoundingClientRect();
                    item.ox = (e.clientX - rect.left) / state.scale;
                    item.oy = (e.clientY - rect.top) / state.scale;
                    state.setDraggedItem(item);
                    state.selectedItems.forEach(i => i.el.classList.add('dragging'));
                    canvas.classList.add('dragging-item');
                }
                return;
            }
        }
    }

    // Memo body text selection
    const memoBody = target.closest('.memo-body');
    if (memoBody && e.button === 0) {
        state.setIsSelectingText(true);

        const handleMouseUp = () => {
            state.setIsSelectingText(false);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousemove', handleMouseMove);
        };

        const handleMouseMove = (e) => {
            if (state.isSelectingText) {
                e.stopPropagation();
            }
        };

        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mousemove', handleMouseMove);

        // Track these for cleanup
        if (item.cleanupFunctions) {
            item.cleanupFunctions.push(() => {
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('mousemove', handleMouseMove);
            });
        }
        return;
    }

    // General item mousedown (for drag)
    const el = item.el;
    const isContentEditable = target.closest('[contenteditable="true"]') || target.classList.contains('memo-body');

    // Always bring item to top when clicking anywhere on it
    el.style.zIndex = state.incrementHighestZ();

    // Skip drag for interactive elements and contenteditable
    if (target.classList.contains('delete-btn') || target.classList.contains('resize-handle') ||
        target.classList.contains('connection-handle') || target.classList.contains('add-child-btn') ||
        target.classList.contains('color-btn') || target.classList.contains('font-size-btn') ||
        target.classList.contains('color-opt') || target.closest('.color-picker') ||
        target.tagName === 'VIDEO' || target.tagName === 'A' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
        isContentEditable) {
        return;
    }
    if (item.locked) return;

    e.stopPropagation();

    // Alt + drag to duplicate item
    if (e.altKey) {
        // Import dynamically to avoid circular dependency
        import('./items.js').then(({ createItem }) => {
            const duplicated = createItem({
                type: item.type,
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
                content: JSON.parse(JSON.stringify(item.content)),
                color: item.color,
                fontSize: item.fontSize
            });
            selectItem(duplicated, false);
            const rect = duplicated.el.getBoundingClientRect();
            duplicated.ox = (e.clientX - rect.left) / state.scale;
            duplicated.oy = (e.clientY - rect.top) / state.scale;
            state.setDraggedItem(duplicated);
            duplicated.el.classList.add('dragging');
            canvas.classList.add('dragging-item');
        });
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
}

/**
 * Handle contextmenu events on canvas items (delegated)
 */
function handleCanvasContextmenu(e) {
    const target = e.target;
    const item = getItemFromElement(target);
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();
    if (!state.selectedItems.has(item)) selectItem(item);
    eventBus.emit(Events.UI_SHOW_CONTEXT_MENU, e.clientX, e.clientY, item);
}

/**
 * Handle mouseover events for connection handle highlighting (delegated)
 */
function handleCanvasMouseover(e) {
    const target = e.target;
    if (!target.classList.contains('connection-handle')) return;

    const item = getItemFromElement(target);
    if (!item) return;

    if (state.connectSource && state.connectSource !== item) {
        item.el.classList.add('connect-target');
    }
}

/**
 * Handle mouseout events for connection handle highlighting (delegated)
 */
function handleCanvasMouseout(e) {
    const target = e.target;
    if (!target.classList.contains('connection-handle')) return;

    const item = getItemFromElement(target);
    if (!item) return;

    item.el.classList.remove('connect-target');
}

/**
 * Handle input events on memo bodies (delegated)
 */
function handleCanvasInput(e) {
    const target = e.target;
    if (!target.classList.contains('memo-body')) return;

    const item = getItemFromElement(target);
    if (!item) return;

    const memoState = getMemoState(item);
    item.content = getHtmlContent(target);
    autoResizeItem(item);
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
    memoState.hasUnsavedChanges = true;

    // Debounced save to undo stack (save after 1 second of no typing)
    if (memoState.undoSaveTimer) clearTimeout(memoState.undoSaveTimer);
    memoState.undoSaveTimer = setTimeout(() => {
        if (memoState.hasUnsavedChanges && item.content !== memoState.contentBeforeEdit) {
            eventBus.emit(Events.STATE_SAVE);
            memoState.contentBeforeEdit = item.content;
            memoState.hasUnsavedChanges = false;
        }
    }, 1000);
}

/**
 * Handle focusin events on memo bodies (delegated)
 */
function handleCanvasFocusin(e) {
    const target = e.target;
    if (!target.classList.contains('memo-body')) return;

    const item = getItemFromElement(target);
    if (!item) return;

    const toolbar = item.el.querySelector('.memo-toolbar');
    if (toolbar) toolbar.classList.add('active');

    // Record content before editing starts
    const memoState = getMemoState(item);
    memoState.contentBeforeEdit = item.content;
    memoState.hasUnsavedChanges = false;
}

/**
 * Handle focusout events on memo bodies (delegated)
 */
function handleCanvasFocusout(e) {
    const target = e.target;
    if (!target.classList.contains('memo-body')) return;

    const item = getItemFromElement(target);
    if (!item) return;

    const toolbar = item.el.querySelector('.memo-toolbar');
    if (toolbar) toolbar.classList.remove('active');

    const memoState = getMemoState(item);
    // Clear pending debounce timer
    if (memoState.undoSaveTimer) {
        clearTimeout(memoState.undoSaveTimer);
        memoState.undoSaveTimer = null;
    }
    // Save to undo stack if content changed during editing
    if (memoState.hasUnsavedChanges && item.content !== memoState.contentBeforeEdit) {
        eventBus.emit(Events.STATE_SAVE);
        memoState.contentBeforeEdit = item.content;
        memoState.hasUnsavedChanges = false;
    }
}

/**
 * Handle paste events on memo bodies (delegated)
 */
function handleCanvasPaste(e) {
    const target = e.target;
    if (!target.classList.contains('memo-body') && !target.closest('.memo-body')) return;

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

        // Convert ordered lists to text-based numbering
        temp.querySelectorAll('ol').forEach(ol => {
            const startNum = parseInt(ol.getAttribute('start'), 10) || 1;
            const items = ol.querySelectorAll(':scope > li');
            items.forEach((li, index) => {
                const liValue = li.getAttribute('value');
                const num = liValue ? parseInt(liValue, 10) : startNum + index;
                li.innerHTML = num + '. ' + li.innerHTML;
            });
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
            const div = document.createElement('div');
            div.innerHTML = ul.innerHTML;
            ul.replaceWith(div);
        });

        // Convert remaining li elements to div
        temp.querySelectorAll('li').forEach(li => {
            const div = document.createElement('div');
            div.innerHTML = li.innerHTML;
            li.replaceWith(div);
        });

        temp.querySelectorAll('*').forEach(el => {
            el.style.color = '';
            el.style.backgroundColor = '';
            el.style.background = '';
            el.removeAttribute('color');
            el.removeAttribute('bgcolor');
        });
        document.execCommand('insertHTML', false, temp.innerHTML);
    }
}

/**
 * Handle keydown events on memo bodies for list formatting (delegated)
 */
function handleCanvasKeydown(e) {
    const target = e.target;
    const mb = target.classList.contains('memo-body') ? target : target.closest('.memo-body');
    if (!mb) return;
    if (e.key !== 'Enter' || e.shiftKey) return;

    const item = getItemFromElement(mb);
    if (!item) return;

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
    const orderedMatch = lineText.match(/^(\d+)\.\s/);
    const unorderedMatch = lineText.match(/^([-*])\s/);

    if (orderedMatch || unorderedMatch) {
        e.preventDefault();

        const isEmptyItem = orderedMatch
            ? lineText.trim() === orderedMatch[1] + '.'
            : lineText.trim() === unorderedMatch[1];

        if (isEmptyItem) {
            const prefixLen = orderedMatch
                ? orderedMatch[0].length
                : unorderedMatch[0].length;

            for (let i = 0; i < prefixLen; i++) {
                document.execCommand('delete', false, null);
            }
        } else {
            let prefix;
            if (orderedMatch) {
                const nextNum = parseInt(orderedMatch[1], 10) + 1;
                prefix = nextNum + '. ';
            } else {
                prefix = unorderedMatch[1] + ' ';
            }

            document.execCommand('insertLineBreak', false, null);
            document.execCommand('insertText', false, prefix);
        }

        mb.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 * Setup canvas-level event delegation for all item events
 * Called once during app initialization
 */
export function setupCanvasEventDelegation() {
    // Click events (buttons, color options, etc.)
    canvas.addEventListener('click', handleCanvasClick);

    // Mousedown events (drag, resize, connections)
    canvas.addEventListener('mousedown', handleCanvasMousedown);

    // Contextmenu events
    canvas.addEventListener('contextmenu', handleCanvasContextmenu);

    // Mouseover/mouseout for connection handle highlighting
    canvas.addEventListener('mouseover', handleCanvasMouseover);
    canvas.addEventListener('mouseout', handleCanvasMouseout);

    // Input events for memo content
    canvas.addEventListener('input', handleCanvasInput);

    // Focus events for memo toolbar
    canvas.addEventListener('focusin', handleCanvasFocusin);
    canvas.addEventListener('focusout', handleCanvasFocusout);

    // Paste events for memo (blocking images, stripping colors)
    canvas.addEventListener('paste', handleCanvasPaste);

    // Keydown events for list formatting
    canvas.addEventListener('keydown', handleCanvasKeydown);
}

/**
 * Initialize an item with data-item-id and any necessary per-item setup
 * Called from createItem in items.js
 * @param {Object} item - The item object
 */
export function initializeItemEventData(item) {
    // Set the data-item-id attribute for event delegation
    item.el.dataset.itemId = item.id;

    // Initialize cleanup functions array
    item.cleanupFunctions = [];

    // Initialize memo state if this is a memo
    if (item.type === 'memo') {
        getMemoState(item);
    }
}
