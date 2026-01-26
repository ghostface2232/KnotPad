// KnotPad - Settings Modal Module
// Handles settings UI utilities, preferences, and data format conversions
//
// Exports:
// - UI helpers: updateFontSizePreview, updateScrollGradient
// - Apply functions: applyWrapMode, applyColorDisplayMode, applyLinkPreviewMode
// - Data helpers: blobToBase64, base64ToBlob

import { $ } from './utils.js';
import * as state from './state.js';
import { loadLinkPreviewForItem, removeLinkPreviewFromItem } from './items.js';

// ============ Font Size Preview ============

/**
 * Update the font size preview in settings modal
 */
export function updateFontSizePreview(size) {
    const previewText = $('previewText');
    if (previewText) {
        previewText.className = 'preview-text size-' + size;
    }
}

// ============ Apply Mode Functions ============

/**
 * Apply wrap mode globally via body class
 */
export function applyWrapMode(mode) {
    document.body.classList.toggle('wrap-mode-character', mode === 'character');
}

/**
 * Apply color display mode globally via body class
 */
export function applyColorDisplayMode(mode) {
    document.body.classList.toggle('color-mode-fill', mode === 'fill');
}

/**
 * Apply link preview mode and update existing link items
 */
export function applyLinkPreviewMode(enabled) {
    document.body.classList.toggle('link-preview-enabled', enabled);
    // Update existing link items
    state.items.filter(item => item.type === 'link').forEach(item => {
        if (enabled) {
            loadLinkPreviewForItem(item);
        } else {
            removeLinkPreviewFromItem(item);
        }
    });
}

// ============ Scroll Gradient Helpers ============

/**
 * Update scroll gradient indicators for a scrollable wrapper
 * @param {HTMLElement} wrapper - The scrollable wrapper element
 */
export function updateScrollGradient(wrapper) {
    if (!wrapper) return;

    const { scrollTop, scrollHeight, clientHeight } = wrapper;
    const threshold = 5;

    const canScrollUp = scrollTop > threshold;
    const canScrollDown = scrollTop + clientHeight < scrollHeight - threshold;

    wrapper.classList.toggle('can-scroll-up', canScrollUp);
    wrapper.classList.toggle('can-scroll-down', canScrollDown);
}

// ============ Data Format Helpers ============

/**
 * Convert a Blob to base64 string
 */
export function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Convert a base64 string to Blob
 */
export function base64ToBlob(base64, mimeType) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// ============ Settings UI Update ============

/**
 * Update all settings UI elements to reflect current state
 * @param {HTMLElement} settingsModal - The settings modal element
 */
export function updateSettingsUI(settingsModal) {
    if (!settingsModal) return;

    // Update font size buttons
    const fontSizeGroup = $('defaultFontSize');
    if (fontSizeGroup) {
        fontSizeGroup.querySelectorAll('.settings-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === state.defaultFontSize);
        });
    }

    // Update font size preview
    updateFontSizePreview(state.defaultFontSize);

    // Update wrap mode buttons
    const wrapModeGroup = $('noteWrapMode');
    if (wrapModeGroup) {
        wrapModeGroup.querySelectorAll('.settings-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === state.noteWrapMode);
        });
    }

    // Update text align buttons
    const textAlignGroup = $('defaultTextAlign');
    if (textAlignGroup) {
        textAlignGroup.querySelectorAll('.settings-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === state.defaultTextAlign);
        });
    }

    // Update color display mode buttons
    const colorDisplayModeGroup = $('colorDisplayMode');
    if (colorDisplayModeGroup) {
        colorDisplayModeGroup.querySelectorAll('.settings-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === state.colorDisplayMode);
        });
    }

    // Update invert wheel zoom toggle
    const invertWheelZoomCheckbox = $('invertWheelZoom');
    if (invertWheelZoomCheckbox) {
        invertWheelZoomCheckbox.checked = state.invertWheelZoom;
    }

    // Update grid snap toggle
    const gridSnapCheckbox = $('gridSnapToggle');
    if (gridSnapCheckbox) {
        gridSnapCheckbox.checked = state.gridSnap;
    }

    // Update link preview toggle
    const linkPreviewCheckbox = $('linkPreviewToggle');
    if (linkPreviewCheckbox) {
        linkPreviewCheckbox.checked = state.linkPreviewEnabled;
    }
}
