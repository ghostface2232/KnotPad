// KnotPad - Menus & Modals Module
// Context menus, Modals, File handling, Sidebar interactions
// Dependency direction: canvas.js, core.js, external modules

import { CANVASES_KEY, COLOR_MAP } from '../constants.js';
import { $, esc, generateId, showToast } from '../utils.js';
import * as state from '../state.js';
import { createItem, addMemo, addLink, deleteSelectedItems, duplicateItem, hideMenus, setupFaviconErrorHandler } from '../items.js';
import { addChildNode } from '../connections.js';
import {
    fsDirectoryHandle,
    isFileSystemSupported,
    saveMedia,
    saveMediaToFileSystem,
    selectStorageFolder,
    disconnectStorageFolder,
    getMediaByIds,
    saveMediaBatch,
    saveCanvasesListToFileSystem,
    saveCanvasToFileSystem,
    saveMediaToFileSystem as saveMediaFS
} from '../storage.js';
import eventBus, { Events } from '../events-bus.js';
import { triggerAutoSave } from './core.js';
import {
    saveCurrentCanvas,
    switchCanvas,
    createNewCanvas,
    deleteCanvas,
    createNewGroup,
    deleteGroup,
    moveCanvasToGroup,
    renderCanvasList,
    saveCanvasesList,
    duplicateCanvas,
    collapseAllGroups,
    expandAllGroups,
    setSidebarContextMenuCallbacks
} from './canvas.js';

// DOM Elements
const sidebar = $('sidebar');
const canvasList = $('canvasList');
const linkModal = $('linkModal');
const settingsModal = $('settingsModal');
const contextMenu = $('contextMenu');
const canvasContextMenu = $('canvasContextMenu');
const fileInput = $('fileInput');

// Sidebar Context Menu Elements
const sidebarCanvasContextMenu = $('sidebarCanvasContextMenu');
const sidebarGroupContextMenu = $('sidebarGroupContextMenu');
const sidebarEmptyContextMenu = $('sidebarEmptyContextMenu');
const groupSubmenu = $('groupSubmenu');

// ============ Item Context Menu ============

export function showContextMenu(x, y, item) {
    hideMenus();
    const lockItem = contextMenu?.querySelector('[data-action="lock"]');
    if (lockItem) lockItem.textContent = item.locked ? 'Unlock' : 'Lock to Back';
    if (contextMenu) {
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.classList.add('active');
    }
}

function deleteItem(item) {
    if (!item) return;
    // Find and remove connections
    const toRemove = state.connections.filter(c => c.from === item || c.to === item);
    toRemove.forEach(c => {
        c.el.remove();
        if (c.hitArea) c.hitArea.remove();
        if (c.arrow) c.arrow.remove();
        if (c.labelGroup) c.labelGroup.remove();
        const idx = state.connections.indexOf(c);
        if (idx > -1) state.connections.splice(idx, 1);
    });
    item.el.remove();
    const idx = state.items.indexOf(item);
    if (idx > -1) state.items.splice(idx, 1);
    eventBus.emit(Events.STATE_SAVE);
    eventBus.emit(Events.AUTOSAVE_TRIGGER);
}

export function setupContextMenu() {
    if (!contextMenu) return;

    contextMenu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', () => {
            if (window.selectedItem) {
                switch (el.dataset.action) {
                    case 'duplicate':
                        duplicateItem(window.selectedItem);
                        break;
                    case 'lock':
                        window.selectedItem.locked = !window.selectedItem.locked;
                        window.selectedItem.el.classList.toggle('locked', window.selectedItem.locked);
                        if (window.selectedItem.locked) window.selectedItem.el.style.zIndex = 1;
                        eventBus.emit(Events.STATE_SAVE);
                        eventBus.emit(Events.AUTOSAVE_TRIGGER);
                        break;
                    case 'delete':
                        if (state.selectedItems.size > 0) deleteSelectedItems();
                        else deleteItem(window.selectedItem);
                        break;
                }
            }
            hideMenus();
        });
    });
}

// ============ Canvas Context Menu ============

let canvasContextX = 0;
let canvasContextY = 0;

export function showCanvasContextMenu(clientX, clientY, canvasX, canvasY) {
    hideMenus();
    canvasContextX = canvasX;
    canvasContextY = canvasY;

    const gridSnapCheck = $('gridSnapCheck');
    const invertZoomCheck = $('invertZoomCheck');
    if (gridSnapCheck) gridSnapCheck.classList.toggle('checked', state.gridSnap);
    if (invertZoomCheck) invertZoomCheck.classList.toggle('checked', state.invertWheelZoom);

    if (canvasContextMenu) {
        canvasContextMenu.style.left = clientX + 'px';
        canvasContextMenu.style.top = clientY + 'px';
        canvasContextMenu.classList.add('active');
    }
}

export function setupCanvasContextMenu() {
    if (!canvasContextMenu) return;

    canvasContextMenu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', () => {
            switch (el.dataset.action) {
                case 'new-memo':
                    addMemo('', canvasContextX, canvasContextY);
                    eventBus.emit(Events.STATE_SAVE);
                    break;
                case 'new-link':
                    openLinkModal();
                    break;
                case 'new-image':
                    fileInput?.click();
                    break;
                case 'grid-snap':
                    state.setGridSnap(!state.gridSnap);
                    $('gridSnapCheck')?.classList.toggle('checked', state.gridSnap);
                    break;
                case 'invert-zoom':
                    state.setInvertWheelZoom(!state.invertWheelZoom);
                    $('invertZoomCheck')?.classList.toggle('checked', state.invertWheelZoom);
                    break;
            }
            canvasContextMenu.classList.remove('active');
        });
    });
}

// ============ Sidebar Context Menus ============

let sidebarContextTargetId = null;

function hideSidebarContextMenus() {
    sidebarCanvasContextMenu?.classList.remove('active');
    sidebarGroupContextMenu?.classList.remove('active');
    sidebarEmptyContextMenu?.classList.remove('active');
    groupSubmenu?.classList.remove('active');
}

function positionContextMenu(menu, x, y) {
    const menuWidth = 180;
    const menuHeight = menu.offsetHeight || 200;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function buildGroupSubmenu(currentCanvasId) {
    if (!groupSubmenu) return;

    const canvas = state.canvases.find(c => c.id === currentCanvasId);
    const currentGroupId = canvas?.groupId || null;
    let html = '';

    if (currentGroupId) {
        html += `<div class="context-submenu-item" data-group-id="">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            No Group
        </div>`;
    }

    state.canvasGroups.forEach(group => {
        if (group.id !== currentGroupId) {
            html += `<div class="context-submenu-item" data-group-id="${group.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                ${esc(group.name)}
            </div>`;
        }
    });

    html += `<div class="context-submenu-item new-group" data-action="new-group">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><path d="M12 11v6M9 14h6" stroke-linecap="round"/></svg>
        New Group...
    </div>`;

    groupSubmenu.innerHTML = html;
}

function showSidebarCanvasContextMenu(canvasId, x, y) {
    hideSidebarContextMenus();
    hideMenus();
    sidebarContextTargetId = canvasId;

    const canvas = state.canvases.find(c => c.id === canvasId);
    const removeFromGroupItem = sidebarCanvasContextMenu?.querySelector('[data-action="remove-from-group"]');
    if (removeFromGroupItem) removeFromGroupItem.style.display = canvas?.groupId ? 'flex' : 'none';

    buildGroupSubmenu(canvasId);

    if (sidebarCanvasContextMenu) {
        positionContextMenu(sidebarCanvasContextMenu, x, y);
        sidebarCanvasContextMenu.classList.add('active');
    }
}

function showSidebarGroupContextMenu(groupId, x, y) {
    hideSidebarContextMenus();
    hideMenus();
    sidebarContextTargetId = groupId;

    const collapseText = document.getElementById('groupCollapseText');
    if (collapseText) {
        collapseText.textContent = state.collapsedGroups.has(groupId) ? 'Expand' : 'Collapse';
    }

    if (sidebarGroupContextMenu) {
        positionContextMenu(sidebarGroupContextMenu, x, y);
        sidebarGroupContextMenu.classList.add('active');
    }
}

function showSidebarEmptyContextMenu(x, y) {
    hideSidebarContextMenus();
    hideMenus();

    if (sidebarEmptyContextMenu) {
        positionContextMenu(sidebarEmptyContextMenu, x, y);
        sidebarEmptyContextMenu.classList.add('active');
    }
}

export function setupSidebarContextMenus() {
    // Register context menu callbacks with canvas module (avoids circular imports)
    setSidebarContextMenuCallbacks(
        showSidebarCanvasContextMenu,
        showSidebarGroupContextMenu,
        showSidebarEmptyContextMenu
    );

    if (!sidebarCanvasContextMenu || !sidebarGroupContextMenu || !sidebarEmptyContextMenu) return;

    // Close menus on outside click
    document.addEventListener('click', e => {
        if (!e.target.closest('.context-menu')) hideSidebarContextMenus();
    });

    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('.sidebar')) hideSidebarContextMenus();
    });

    // Canvas context menu actions
    sidebarCanvasContextMenu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', async e => {
            e.stopPropagation();
            const action = el.dataset.action;
            const canvasId = sidebarContextTargetId;

            switch (action) {
                case 'rename': {
                    const entry = canvasList?.querySelector(`.canvas-item-entry[data-id="${canvasId}"]`);
                    if (entry) {
                        hideSidebarContextMenus();
                        const nameEl = entry.querySelector('.canvas-name');
                        const oldName = state.canvases.find(c => c.id === canvasId)?.name || '';
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'canvas-name-input';
                        input.value = oldName;
                        nameEl.replaceWith(input);
                        input.focus();
                        input.select();
                        entry.draggable = false;

                        const finish = () => {
                            entry.draggable = true;
                            const c = state.canvases.find(x => x.id === canvasId);
                            if (c) {
                                c.name = input.value.trim() || 'Untitled';
                                c.updatedAt = Date.now();
                                saveCanvasesList();
                                renderCanvasList();
                                const topbarName = $('topbarCanvasName');
                                if (topbarName && canvasId === state.currentCanvasId) {
                                    topbarName.textContent = c.name;
                                }
                            }
                        };
                        input.addEventListener('blur', finish);
                        input.addEventListener('keydown', e => {
                            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                            if (e.key === 'Escape') { input.value = oldName; input.blur(); }
                        });
                    }
                    break;
                }
                case 'customize': {
                    const entry = canvasList?.querySelector(`.canvas-item-entry[data-id="${canvasId}"]`);
                    if (entry) {
                        hideSidebarContextMenus();
                        entry.querySelector('.canvas-icon')?.click();
                    }
                    break;
                }
                case 'duplicate':
                    hideSidebarContextMenus();
                    await duplicateCanvas(canvasId);
                    break;
                case 'add-to-group':
                    groupSubmenu?.classList.toggle('active');
                    return;
                case 'remove-from-group': {
                    const canvas = state.canvases.find(c => c.id === canvasId);
                    if (canvas) {
                        canvas.groupId = null;
                        saveCanvasesList();
                        renderCanvasList();
                    }
                    hideSidebarContextMenus();
                    break;
                }
                case 'delete':
                    hideSidebarContextMenus();
                    deleteCanvas(canvasId);
                    break;
                default:
                    hideSidebarContextMenus();
            }
        });
    });

    // Group submenu delegation
    groupSubmenu?.addEventListener('click', e => {
        const item = e.target.closest('.context-submenu-item');
        if (!item) return;
        e.stopPropagation();
        const canvasId = sidebarContextTargetId;

        if (item.dataset.action === 'new-group') {
            const ng = { id: generateId(), name: 'New Group', createdAt: Date.now() };
            state.canvasGroups.push(ng);
            const canvas = state.canvases.find(c => c.id === canvasId);
            if (canvas) canvas.groupId = ng.id;
            saveCanvasesList();
            renderCanvasList();
            setTimeout(() => {
                const header = canvasList?.querySelector(`.canvas-group[data-group-id="${ng.id}"] .canvas-group-header`);
                if (header) {
                    const nameEl = header.querySelector('.group-name');
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'group-name-input';
                    input.value = 'New Group';
                    nameEl.replaceWith(input);
                    input.focus();
                    input.select();
                    const finish = () => {
                        const g = state.canvasGroups.find(x => x.id === ng.id);
                        if (g) {
                            g.name = input.value.trim() || 'Untitled Group';
                            saveCanvasesList();
                            renderCanvasList();
                        }
                    };
                    input.addEventListener('blur', finish);
                    input.addEventListener('keydown', ev => {
                        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
                        if (ev.key === 'Escape') { input.value = 'New Group'; input.blur(); }
                    });
                }
            }, 50);
        } else {
            const groupId = item.dataset.groupId || null;
            moveCanvasToGroup(canvasId, groupId);
        }
        hideSidebarContextMenus();
    });

    // Group context menu actions
    sidebarGroupContextMenu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', async e => {
            e.stopPropagation();
            const action = el.dataset.action;
            const groupId = sidebarContextTargetId;

            switch (action) {
                case 'rename': {
                    const header = canvasList?.querySelector(`.canvas-group[data-group-id="${groupId}"] .canvas-group-header`);
                    if (header) {
                        hideSidebarContextMenus();
                        const nameEl = header.querySelector('.group-name');
                        const oldName = state.canvasGroups.find(g => g.id === groupId)?.name || '';
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'group-name-input';
                        input.value = oldName;
                        nameEl.replaceWith(input);
                        input.focus();
                        input.select();
                        const finish = () => {
                            const g = state.canvasGroups.find(x => x.id === groupId);
                            if (g) {
                                g.name = input.value.trim() || 'Untitled Group';
                                saveCanvasesList();
                                renderCanvasList();
                            }
                        };
                        input.addEventListener('blur', finish);
                        input.addEventListener('keydown', ev => {
                            if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
                            if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
                        });
                    }
                    break;
                }
                case 'add-canvas':
                    hideSidebarContextMenus();
                    await saveCurrentCanvas();
                    await createNewCanvas(groupId);
                    break;
                case 'toggle-collapse': {
                    state.toggleGroupCollapsed(groupId);
                    const groupEl = canvasList?.querySelector(`.canvas-group[data-group-id="${groupId}"]`);
                    groupEl?.classList.toggle('collapsed');
                    hideSidebarContextMenus();
                    break;
                }
                case 'delete':
                    hideSidebarContextMenus();
                    deleteGroup(groupId);
                    break;
                default:
                    hideSidebarContextMenus();
            }
        });
    });

    // Empty context menu actions
    sidebarEmptyContextMenu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', async e => {
            e.stopPropagation();
            switch (el.dataset.action) {
                case 'new-canvas':
                    hideSidebarContextMenus();
                    await saveCurrentCanvas();
                    await createNewCanvas();
                    break;
                case 'new-group':
                    hideSidebarContextMenus();
                    createNewGroup();
                    break;
                case 'collapse-all':
                    hideSidebarContextMenus();
                    collapseAllGroups();
                    break;
                case 'expand-all':
                    hideSidebarContextMenus();
                    expandAllGroups();
                    break;
                default:
                    hideSidebarContextMenus();
            }
        });
    });
}

// Bind context menu events to canvas list (called after render)
export function bindSidebarContextEvents() {
    if (!canvasList) return;

    canvasList.querySelectorAll('.canvas-item-entry').forEach(entry => {
        entry.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            showSidebarCanvasContextMenu(entry.dataset.id, e.clientX, e.clientY);
        });
    });

    canvasList.querySelectorAll('.canvas-group-header').forEach(header => {
        header.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            showSidebarGroupContextMenu(header.dataset.groupId, e.clientX, e.clientY);
        });
    });
}

export function setupEmptySpaceContextMenu() {
    if (!canvasList) return;

    canvasList.addEventListener('contextmenu', e => {
        if (!e.target.closest('.canvas-item-entry') &&
            !e.target.closest('.canvas-group-header') &&
            !e.target.closest('.canvas-group-content')) {
            e.preventDefault();
            e.stopPropagation();
            showSidebarEmptyContextMenu(e.clientX, e.clientY);
        }
    });

    const sidebarFooter = sidebar?.querySelector('.sidebar-footer');
    if (sidebarFooter) {
        sidebarFooter.addEventListener('contextmenu', e => {
            if (!e.target.closest('.sidebar-settings-btn')) {
                e.preventDefault();
                e.stopPropagation();
                showSidebarEmptyContextMenu(e.clientX, e.clientY);
            }
        });
    }
}

// ============ Child Type Picker (Direct Memo Creation) ============

export function showChildTypePicker(parentItem, direction, e) {
    addChildNode(parentItem, direction);
}

export function setupChildTypePicker() {
    // No longer needed - memo is created directly
}

export function showNewNodePicker(clientX, clientY, canvasX, canvasY) {
    addMemo('', canvasX, canvasY);
    eventBus.emit(Events.STATE_SAVE);
}

export function setupNewNodePicker() {
    // No longer needed
}

// ============ Link Modal ============

let editingLinkItem = null;

export function openLinkModal(itemToEdit = null) {
    if (!linkModal) return;

    editingLinkItem = itemToEdit;
    const modalTitle = linkModal.querySelector('h3');
    const submitBtn = $('linkSubmit');

    if (itemToEdit) {
        if (modalTitle) modalTitle.textContent = 'Edit Link';
        if (submitBtn) submitBtn.textContent = 'Save';
        const titleInput = $('linkTitle');
        const urlInput = $('linkUrl');
        if (titleInput) titleInput.value = itemToEdit.content.title || '';
        if (urlInput) urlInput.value = itemToEdit.content.url || '';
    } else {
        if (modalTitle) modalTitle.textContent = 'Add Link';
        if (submitBtn) submitBtn.textContent = 'Add';
        const titleInput = $('linkTitle');
        const urlInput = $('linkUrl');
        if (titleInput) titleInput.value = '';
        if (urlInput) urlInput.value = '';
    }

    linkModal.classList.add('active');
    setTimeout(() => $('linkUrl')?.focus(), 100);
}

export function closeLinkModal() {
    if (!linkModal) return;
    linkModal.classList.remove('active');
    const titleInput = $('linkTitle');
    const urlInput = $('linkUrl');
    if (titleInput) titleInput.value = '';
    if (urlInput) urlInput.value = '';
    hideLinkModalError();
}

function isValidUrl(string) {
    let urlString = string;
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        urlString = 'https://' + urlString;
    }
    try {
        const url = new URL(urlString);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function showLinkModalError(message) {
    const errorEl = $('linkModalError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('visible');
    }
}

function hideLinkModalError() {
    const errorEl = $('linkModalError');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.remove('visible');
    }
}

function submitLinkModal() {
    const urlInput = $('linkUrl');
    let url = urlInput?.value.trim() || '';

    if (!url) {
        showLinkModalError('Please enter a URL.');
        urlInput?.focus();
        return;
    }

    if (!isValidUrl(url)) {
        showLinkModalError('Please enter a valid URL.');
        urlInput?.focus();
        return;
    }

    if (!url.startsWith('http')) url = 'https://' + url;
    const x = (innerWidth / 2 - state.offsetX) / state.scale - 130;
    const y = (innerHeight / 2 - state.offsetY) / state.scale - 50;
    addLink(url, $('linkTitle')?.value.trim() || '', x, y);
    eventBus.emit(Events.STATE_SAVE);
    closeLinkModal();
}

export function setupLinkModal() {
    if (!linkModal) return;

    linkModal.addEventListener('click', e => { if (e.target === linkModal) closeLinkModal(); });
    linkModal.querySelector('[data-close]')?.addEventListener('click', closeLinkModal);

    $('linkSubmit')?.addEventListener('click', () => {
        let url = $('linkUrl')?.value.trim() || '';
        if (url) {
            if (!url.startsWith('http')) url = 'https://' + url;

            if (editingLinkItem) {
                const domain = new URL(url).hostname;
                const title = $('linkTitle')?.value.trim() || domain;
                editingLinkItem.content = {
                    url,
                    title,
                    display: url.replace(/^https?:\/\//, '').replace(/\/$/, '')
                };
                const el = editingLinkItem.el;
                const faviconEl = el.querySelector('.link-favicon');
                if (faviconEl) {
                    faviconEl.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                    setupFaviconErrorHandler(faviconEl);
                }
                const linkTitleEl = el.querySelector('.link-title');
                if (linkTitleEl) linkTitleEl.textContent = title;
                const linkUrlEl = el.querySelector('.link-url');
                if (linkUrlEl) {
                    linkUrlEl.textContent = editingLinkItem.content.display;
                    linkUrlEl.href = url;
                }
                eventBus.emit(Events.STATE_SAVE);
            } else {
                const x = (innerWidth / 2 - state.offsetX) / state.scale - 130;
                const y = (innerHeight / 2 - state.offsetY) / state.scale - 50;
                addLink(url, $('linkTitle')?.value.trim() || '', x, y);
                eventBus.emit(Events.STATE_SAVE);
            }
            closeLinkModal();
        }
    });

    $('linkTitle')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitLinkModal();
        }
    });

    $('linkUrl')?.addEventListener('input', hideLinkModalError);
}

// ============ Settings Modal ============

export function openSettingsModal() {
    if (settingsModal) {
        updateStorageModalState();
        updateSettingsUI();
        settingsModal.classList.add('active');
    }
}

export function closeSettingsModal() {
    settingsModal?.classList.remove('active');
}

function updateStorageModalState() {
    const connected = !!fsDirectoryHandle;
    const browserCard = $('browserStorageCard');
    const fileCard = $('fileStorageCard');
    const fileStorageBadge = $('fileStorageBadge');

    if (browserCard && fileCard) {
        if (connected) {
            browserCard.classList.remove('active');
            fileCard.classList.add('active');
        } else {
            browserCard.classList.add('active');
            fileCard.classList.remove('active');
        }
    }

    if (fileStorageBadge) {
        if (connected) {
            fileStorageBadge.textContent = fsDirectoryHandle?.name || 'Connected';
            fileStorageBadge.classList.remove('disconnected');
        } else {
            fileStorageBadge.textContent = 'Not Connected';
            fileStorageBadge.classList.add('disconnected');
        }
    }
}

function updateFontSizePreview(size) {
    const previewText = $('previewText');
    if (previewText) previewText.className = 'preview-text size-' + size;
}

function updateWrapModePreview(mode) {
    const previewWrapText = $('previewWrapText');
    if (previewWrapText) {
        previewWrapText.className = 'preview-text-wrap' + (mode === 'character' ? ' wrap-character' : '');
    }
}

export function applyWrapMode(mode) {
    document.body.classList.toggle('wrap-mode-character', mode === 'character');
}

function updateSettingsUI() {
    const fontSizeGroup = $('defaultFontSize');
    if (fontSizeGroup) {
        fontSizeGroup.querySelectorAll('.settings-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === state.defaultFontSize);
        });
    }
    updateFontSizePreview(state.defaultFontSize);

    const wrapModeGroup = $('noteWrapMode');
    if (wrapModeGroup) {
        wrapModeGroup.querySelectorAll('.settings-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === state.noteWrapMode);
        });
    }
    updateWrapModePreview(state.noteWrapMode);

    const invertWheelZoomCheckbox = $('invertWheelZoom');
    if (invertWheelZoomCheckbox) invertWheelZoomCheckbox.checked = state.invertWheelZoom;

    const gridSnapCheckbox = $('gridSnapToggle');
    if (gridSnapCheckbox) gridSnapCheckbox.checked = state.gridSnap;
}

export function setupSettingsModal() {
    $('settingsBtn')?.addEventListener('click', openSettingsModal);

    if (settingsModal) {
        settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettingsModal(); });
        settingsModal.querySelector('[data-close]')?.addEventListener('click', closeSettingsModal);

        settingsModal.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                settingsModal.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                settingsModal.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = settingsModal.querySelector(`.settings-panel[data-panel="${tab.dataset.tab}"]`);
                panel?.classList.add('active');
            });
        });
    }

    const browserCard = $('browserStorageCard');
    const fileCard = $('fileStorageCard');

    if (fileCard && !isFileSystemSupported()) {
        fileCard.classList.add('disabled');
        fileCard.title = 'File System API is not supported in this browser.';
        const desc = fileCard.querySelector('.storage-card-desc');
        if (desc) desc.textContent = 'Not supported in this browser';
    }

    browserCard?.addEventListener('click', async () => {
        if (fsDirectoryHandle) {
            await disconnectStorageFolder();
            updateStorageModalState();
        }
    });

    fileCard?.addEventListener('click', async () => {
        if (fileCard.classList.contains('disabled')) return;
        const success = await selectStorageFolder();
        if (success) updateStorageModalState();
    });

    $('exportAllBtn')?.addEventListener('click', exportAllCanvases);

    const importAllInput = $('importAllInput');
    $('importAllBtn')?.addEventListener('click', () => importAllInput?.click());
    importAllInput?.addEventListener('change', importAllCanvases);

    const fontSizeGroup = $('defaultFontSize');
    fontSizeGroup?.querySelectorAll('.settings-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            fontSizeGroup.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.setDefaultFontSize(btn.dataset.value);
            updateFontSizePreview(btn.dataset.value);
        });
    });

    const wrapModeGroup = $('noteWrapMode');
    wrapModeGroup?.querySelectorAll('.settings-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            wrapModeGroup.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.setNoteWrapMode(btn.dataset.value);
            updateWrapModePreview(btn.dataset.value);
            applyWrapMode(btn.dataset.value);
        });
    });

    $('invertWheelZoom')?.addEventListener('change', function() {
        state.setInvertWheelZoom(this.checked);
    });

    $('gridSnapToggle')?.addEventListener('change', function() {
        state.setGridSnap(this.checked);
    });
}

// ============ Export/Import ============

async function exportAllCanvases() {
    try {
        await saveCurrentCanvas();

        const allData = {
            version: 2,
            exportedAt: new Date().toISOString(),
            canvases: state.canvases.map(c => ({ ...c })),
            data: {},
            media: {}
        };

        const mediaIds = new Set();
        for (const canvas of state.canvases) {
            const savedData = localStorage.getItem('knotpad-data-' + canvas.id);
            if (savedData) {
                const canvasData = JSON.parse(savedData);
                allData.data[canvas.id] = canvasData;
                if (canvasData.items) {
                    for (const item of canvasData.items) {
                        if ((item.type === 'image' || item.type === 'video') && item.content?.startsWith('media_')) {
                            mediaIds.add(item.content);
                        }
                    }
                }
            }
        }

        if (mediaIds.size > 0) {
            showToast('Exporting media...', 'info');
            const mediaBlobs = await getMediaByIds([...mediaIds]);
            for (const [id, blob] of Object.entries(mediaBlobs)) {
                try {
                    const base64 = await blobToBase64(blob);
                    allData.media[id] = { type: blob.type, data: base64 };
                } catch (e) {
                    console.warn('Failed to export media:', id, e);
                }
            }
        }

        const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `knotpad-all-canvases-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        const mediaCount = Object.keys(allData.media).length;
        showToast(`Exported ${state.canvases.length} canvas(es)${mediaCount > 0 ? ` with ${mediaCount} media file(s)` : ''}`);
    } catch (e) {
        console.error('Export failed:', e);
        showToast('Export failed', 'error');
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64, mimeType) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

async function importAllCanvases(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const allData = JSON.parse(text);

        if (!allData.version || !allData.canvases || !allData.data) {
            showToast('Invalid file format', 'error');
            e.target.value = '';
            return;
        }

        const canvasCount = allData.canvases.length;
        const mediaCount = allData.media ? Object.keys(allData.media).length : 0;
        const mediaInfo = mediaCount > 0 ? ` and ${mediaCount} media file(s)` : '';
        if (!confirm(`Import ${canvasCount} canvas(es)${mediaInfo}? Existing canvases with the same ID will be overwritten.`)) {
            e.target.value = '';
            return;
        }

        if (allData.media && Object.keys(allData.media).length > 0) {
            showToast('Importing media...', 'info');
            const mediaEntries = [];
            for (const [id, mediaData] of Object.entries(allData.media)) {
                try {
                    const blob = base64ToBlob(mediaData.data, mediaData.type);
                    mediaEntries.push({ id, blob });
                    if (fsDirectoryHandle) await saveMediaFS(id, blob);
                } catch (err) {
                    console.warn('Failed to import media:', id, err);
                }
            }
            await saveMediaBatch(mediaEntries);
        }

        for (const canvas of allData.canvases) {
            const existingIndex = state.canvases.findIndex(c => c.id === canvas.id);
            if (existingIndex >= 0) {
                state.canvases[existingIndex] = { ...canvas };
            } else {
                state.canvases.push({ ...canvas });
            }
            if (allData.data[canvas.id]) {
                localStorage.setItem('knotpad-data-' + canvas.id, JSON.stringify(allData.data[canvas.id]));
                if (fsDirectoryHandle) await saveCanvasToFileSystem(canvas.id, allData.data[canvas.id]);
            }
        }

        localStorage.setItem(CANVASES_KEY, JSON.stringify(state.canvases));
        if (fsDirectoryHandle) await saveCanvasesListToFileSystem();

        renderCanvasList();

        if (allData.data[state.currentCanvasId]) {
            await switchCanvas(state.currentCanvasId);
        }

        const importedMediaCount = allData.media ? Object.keys(allData.media).length : 0;
        showToast(`Imported ${canvasCount} canvas(es)${importedMediaCount > 0 ? ` with ${importedMediaCount} media file(s)` : ''}`);
    } catch (err) {
        console.error('Import failed:', err);
        showToast('Import failed', 'error');
    }

    e.target.value = '';
}

// ============ Sidebar Resize ============

const SIDEBAR_WIDTH_KEY = 'knotpad-sidebar-width';
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;

export function setupSidebarResize() {
    const resizeHandle = $('sidebarResizeHandle');
    if (!resizeHandle) return;

    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
        document.documentElement.style.setProperty('--sidebar-width', savedWidth + 'px');
    }

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', e => {
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 280;
        sidebar?.classList.add('resizing');
        resizeHandle.classList.add('active');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        const delta = e.clientX - startX;
        let newWidth = startWidth + delta;
        newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth));
        document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        sidebar?.classList.remove('resizing');
        resizeHandle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const currentWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 280;
        localStorage.setItem(SIDEBAR_WIDTH_KEY, currentWidth);
    });
}

// ============ File Handling ============

export async function handleFile(file, x, y) {
    const mediaId = 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
            let w = img.width, h = img.height;
            if (w > 400) { h = 400 / w * h; w = 400; }
            if (h > 300) { w = 300 / h * w; h = 300; }
            URL.revokeObjectURL(url);
            await saveMedia(mediaId, file);
            if (fsDirectoryHandle) await saveMediaToFileSystem(mediaId, file);
            state.blobURLCache.set(mediaId, URL.createObjectURL(file));
            createItem({ type: 'image', x, y, w, h, content: mediaId });
            eventBus.emit(Events.STATE_SAVE);
            triggerAutoSave();
        };
        img.src = url;
    } else if (file.type.startsWith('video/')) {
        await saveMedia(mediaId, file);
        if (fsDirectoryHandle) await saveMediaToFileSystem(mediaId, file);
        state.blobURLCache.set(mediaId, URL.createObjectURL(file));
        createItem({ type: 'video', x, y, w: 400, h: 225, content: mediaId });
        eventBus.emit(Events.STATE_SAVE);
        triggerAutoSave();
    }
}
