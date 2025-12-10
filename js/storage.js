// KnotPad - Storage Module (IndexedDB + File System API)

import { DB_NAME, DB_VERSION, MEDIA_STORE, CANVASES_DIR, MEDIA_DIR, FS_STORAGE_KEY, MEDIA_EXTENSIONS } from './constants.js';
import { showToast, $, getExtensionFromMimeType } from './utils.js';
import * as state from './state.js';

// IndexedDB instance
let mediaDB = null;

// File System directory handle
export let fsDirectoryHandle = null;

// ============ IndexedDB Functions ============

export function initMediaDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            mediaDB = req.result;
            resolve();
        };
        req.onupgradeneeded = e => {
            if (!e.target.result.objectStoreNames.contains(MEDIA_STORE)) {
                e.target.result.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
            }
        };
    });
}

export function saveMedia(id, blob) {
    return new Promise((resolve, reject) => {
        if (!mediaDB) { reject(); return; }
        const tx = mediaDB.transaction(MEDIA_STORE, 'readwrite');
        tx.objectStore(MEDIA_STORE).put({ id, blob });
        tx.oncomplete = () => resolve(id);
        tx.onerror = () => reject();
    });
}

export function loadMedia(id) {
    return new Promise((resolve) => {
        if (!mediaDB) { resolve(null); return; }
        const tx = mediaDB.transaction(MEDIA_STORE, 'readonly');
        const req = tx.objectStore(MEDIA_STORE).get(id);
        req.onsuccess = () => resolve(req.result?.blob || null);
        req.onerror = () => resolve(null);
    });
}

export function deleteMedia(id) {
    if (!mediaDB) return;
    const tx = mediaDB.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).delete(id);
}

// ============ File System API Functions ============

export function isFileSystemSupported() {
    return 'showDirectoryPicker' in window;
}

export async function selectStorageFolder() {
    if (!isFileSystemSupported()) {
        showToast('File System API not supported in this browser', 'error');
        return false;
    }
    try {
        fsDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        // Create subdirectories
        await fsDirectoryHandle.getDirectoryHandle(CANVASES_DIR, { create: true });
        await fsDirectoryHandle.getDirectoryHandle(MEDIA_DIR, { create: true });
        localStorage.setItem(FS_STORAGE_KEY, 'true');
        updateStorageIndicator(true);
        showToast('Storage folder connected');
        return true;
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Failed to select folder:', e);
            showToast('Failed to select folder', 'error');
        }
        return false;
    }
}

export async function disconnectStorageFolder() {
    fsDirectoryHandle = null;
    localStorage.removeItem(FS_STORAGE_KEY);
    updateStorageIndicator(false);
    showToast('Storage folder disconnected');
}

export async function requestFsPermission() {
    if (!fsDirectoryHandle) return false;
    try {
        const permission = await fsDirectoryHandle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') return true;
        const request = await fsDirectoryHandle.requestPermission({ mode: 'readwrite' });
        return request === 'granted';
    } catch (e) {
        console.error('Permission error:', e);
        return false;
    }
}

export function updateStorageIndicator(connected) {
    const indicator = $('storageIndicator');
    const statusText = $('storageStatusText');
    if (indicator) {
        indicator.classList.toggle('connected', connected);
        indicator.title = connected ? 'File storage connected - Click to manage' : 'Using browser storage - Click to connect folder';
    }
    if (statusText) {
        statusText.textContent = connected ? 'File Storage' : 'Browser Storage';
    }
}

// ============ File System Canvas Operations ============

export async function saveCanvasesListToFileSystem() {
    if (!fsDirectoryHandle) return;
    try {
        const canvasesDir = await fsDirectoryHandle.getDirectoryHandle(CANVASES_DIR, { create: true });
        const fileHandle = await canvasesDir.getFileHandle('_index.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(state.canvases, null, 2));
        await writable.close();
    } catch (e) {
        console.error('Failed to save canvases list to file system:', e);
    }
}

export async function loadCanvasesListFromFileSystem() {
    if (!fsDirectoryHandle) return null;
    try {
        const canvasesDir = await fsDirectoryHandle.getDirectoryHandle(CANVASES_DIR);
        const fileHandle = await canvasesDir.getFileHandle('_index.json');
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

export async function saveCanvasToFileSystem(canvasId, data) {
    if (!fsDirectoryHandle) return;
    try {
        const canvasesDir = await fsDirectoryHandle.getDirectoryHandle(CANVASES_DIR, { create: true });
        const fileHandle = await canvasesDir.getFileHandle(canvasId + '.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    } catch (e) {
        console.error('Failed to save canvas to file system:', e);
    }
}

export async function loadCanvasFromFileSystem(canvasId) {
    if (!fsDirectoryHandle) return null;
    try {
        const canvasesDir = await fsDirectoryHandle.getDirectoryHandle(CANVASES_DIR);
        const fileHandle = await canvasesDir.getFileHandle(canvasId + '.json');
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

export async function deleteCanvasFromFileSystem(canvasId) {
    if (!fsDirectoryHandle) return;
    try {
        const canvasesDir = await fsDirectoryHandle.getDirectoryHandle(CANVASES_DIR);
        await canvasesDir.removeEntry(canvasId + '.json');
    } catch (e) {
        console.error('Failed to delete canvas from file system:', e);
    }
}

// ============ File System Media Operations ============

export async function saveMediaToFileSystem(mediaId, blob) {
    if (!fsDirectoryHandle) return;
    try {
        const mediaDir = await fsDirectoryHandle.getDirectoryHandle(MEDIA_DIR, { create: true });
        const ext = getExtensionFromMimeType(blob.type);
        const fileHandle = await mediaDir.getFileHandle(mediaId + ext, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    } catch (e) {
        console.error('Failed to save media to file system:', e);
    }
}

export async function loadMediaFromFileSystem(mediaId) {
    if (!fsDirectoryHandle) return null;
    try {
        const mediaDir = await fsDirectoryHandle.getDirectoryHandle(MEDIA_DIR);
        for (const ext of MEDIA_EXTENSIONS) {
            try {
                const fileHandle = await mediaDir.getFileHandle(mediaId + ext);
                const file = await fileHandle.getFile();
                return file;
            } catch (e) {
                continue;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

export async function deleteMediaFromFileSystem(mediaId) {
    if (!fsDirectoryHandle) return;
    try {
        const mediaDir = await fsDirectoryHandle.getDirectoryHandle(MEDIA_DIR);
        for (const ext of MEDIA_EXTENSIONS) {
            try {
                await mediaDir.removeEntry(mediaId + ext);
                return;
            } catch (e) {
                continue;
            }
        }
    } catch (e) {
        console.error('Failed to delete media from file system:', e);
    }
}

// ============ Migration ============

export async function migrateToFileSystem() {
    if (!fsDirectoryHandle) return;
    const hasPermission = await requestFsPermission();
    if (!hasPermission) return;

    try {
        // Migrate all canvases
        for (const canvas of state.canvases) {
            const dataKey = 'knotpad-data-' + canvas.id;
            const saved = localStorage.getItem(dataKey);
            if (saved) {
                await saveCanvasToFileSystem(canvas.id, JSON.parse(saved));
            }
        }
        // Migrate canvases list
        await saveCanvasesListToFileSystem();
        showToast('Data migrated to file storage');
    } catch (e) {
        console.error('Migration error:', e);
    }
}

// Set fsDirectoryHandle externally
export function setFsDirectoryHandle(handle) {
    fsDirectoryHandle = handle;
}
