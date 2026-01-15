// KnotPad - Storage Module (IndexedDB + File System API)

import { DB_NAME, DB_VERSION, MEDIA_STORE, FS_HANDLE_STORE, FS_HANDLE_KEY, CANVASES_DIR, MEDIA_DIR, FS_STORAGE_KEY, MEDIA_EXTENSIONS } from './constants.js';
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
            const db = e.target.result;
            if (!db.objectStoreNames.contains(MEDIA_STORE)) {
                db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
            }
            // Add store for File System handle (persistent across sessions)
            if (!db.objectStoreNames.contains(FS_HANDLE_STORE)) {
                db.createObjectStore(FS_HANDLE_STORE, { keyPath: 'id' });
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

export function getMediaByIds(ids) {
    return new Promise((resolve) => {
        if (!mediaDB || !ids || ids.length === 0) { resolve({}); return; }
        const result = {};
        const tx = mediaDB.transaction(MEDIA_STORE, 'readonly');
        const store = tx.objectStore(MEDIA_STORE);
        let pending = ids.length;

        ids.forEach(id => {
            const req = store.get(id);
            req.onsuccess = () => {
                if (req.result?.blob) {
                    result[id] = req.result.blob;
                }
                pending--;
                if (pending === 0) resolve(result);
            };
            req.onerror = () => {
                pending--;
                if (pending === 0) resolve(result);
            };
        });
    });
}

export function saveMediaBatch(mediaEntries) {
    return new Promise((resolve, reject) => {
        if (!mediaDB || !mediaEntries || mediaEntries.length === 0) { resolve(); return; }
        const tx = mediaDB.transaction(MEDIA_STORE, 'readwrite');
        const store = tx.objectStore(MEDIA_STORE);

        mediaEntries.forEach(({ id, blob }) => {
            store.put({ id, blob });
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// ============ Persistent Storage Functions ============

// Request persistent storage to prevent browser from clearing data
export async function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) {
        console.log('Storage persistence API not supported');
        return false;
    }
    try {
        const isPersisted = await navigator.storage.persisted();
        if (isPersisted) {
            console.log('Storage is already persistent');
            return true;
        }
        const granted = await navigator.storage.persist();
        console.log(`Persistent storage ${granted ? 'granted' : 'denied'}`);
        return granted;
    } catch (e) {
        console.error('Failed to request persistent storage:', e);
        return false;
    }
}

// Save directory handle to IndexedDB (survives browser restart)
export function saveFsHandleToIndexedDB(handle) {
    return new Promise((resolve, reject) => {
        if (!mediaDB) { reject(new Error('DB not initialized')); return; }
        try {
            const tx = mediaDB.transaction(FS_HANDLE_STORE, 'readwrite');
            tx.objectStore(FS_HANDLE_STORE).put({ id: FS_HANDLE_KEY, handle });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        } catch (e) {
            reject(e);
        }
    });
}

// Load directory handle from IndexedDB
export function loadFsHandleFromIndexedDB() {
    return new Promise((resolve) => {
        if (!mediaDB) { resolve(null); return; }
        try {
            const tx = mediaDB.transaction(FS_HANDLE_STORE, 'readonly');
            const req = tx.objectStore(FS_HANDLE_STORE).get(FS_HANDLE_KEY);
            req.onsuccess = () => resolve(req.result?.handle || null);
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

// Remove directory handle from IndexedDB
export function removeFsHandleFromIndexedDB() {
    return new Promise((resolve) => {
        if (!mediaDB) { resolve(); return; }
        try {
            const tx = mediaDB.transaction(FS_HANDLE_STORE, 'readwrite');
            tx.objectStore(FS_HANDLE_STORE).delete(FS_HANDLE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        } catch (e) {
            resolve();
        }
    });
}

// Try to restore file system connection from saved handle
export async function tryRestoreFsConnection() {
    // Check localStorage flag first (quick check)
    const wasConnected = localStorage.getItem(FS_STORAGE_KEY) === 'true';
    if (!wasConnected) return false;

    // Try to load handle from IndexedDB
    const savedHandle = await loadFsHandleFromIndexedDB();
    if (!savedHandle) {
        // Handle not found in IndexedDB, clear the flag
        localStorage.removeItem(FS_STORAGE_KEY);
        updateStorageIndicator(false);
        return false;
    }

    // Verify permission
    try {
        const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
            // Permission already granted, restore connection
            fsDirectoryHandle = savedHandle;
            updateStorageIndicator(true);
            console.log('File system connection restored automatically');
            return true;
        } else {
            // Need to request permission - show indicator that reconnection is possible
            fsDirectoryHandle = savedHandle;
            updateStorageIndicator(false, true); // Show "reconnect" state
            console.log('File system handle found, permission needed');
            return 'needs-permission';
        }
    } catch (e) {
        console.error('Failed to verify handle permission:', e);
        // Handle is invalid, clean up
        await removeFsHandleFromIndexedDB();
        localStorage.removeItem(FS_STORAGE_KEY);
        updateStorageIndicator(false);
        return false;
    }
}

// Re-request permission for saved handle (user interaction required)
export async function reconnectStorageFolder() {
    if (!fsDirectoryHandle) {
        showToast('No saved connection found', 'error');
        return false;
    }
    try {
        const permission = await fsDirectoryHandle.requestPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
            updateStorageIndicator(true);
            showToast('Storage folder reconnected');
            return true;
        } else {
            showToast('Permission denied', 'error');
            return false;
        }
    } catch (e) {
        console.error('Failed to reconnect:', e);
        showToast('Failed to reconnect', 'error');
        return false;
    }
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

        // Save handle to IndexedDB for persistence (primary storage)
        try {
            await saveFsHandleToIndexedDB(fsDirectoryHandle);
        } catch (e) {
            console.error('Failed to save handle to IndexedDB:', e);
        }

        // Also save flag to localStorage (backup/quick check)
        localStorage.setItem(FS_STORAGE_KEY, 'true');

        // Request persistent storage to prevent browser cleanup
        await requestPersistentStorage();

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
    // Remove from both storages
    localStorage.removeItem(FS_STORAGE_KEY);
    await removeFsHandleFromIndexedDB();
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

export function updateStorageIndicator(connected, needsPermission = false) {
    const indicator = $('storageIndicator');
    const statusText = $('storageStatusText');
    if (indicator) {
        indicator.classList.toggle('connected', connected);
        indicator.classList.toggle('needs-permission', needsPermission && !connected);
        if (connected) {
            indicator.title = 'File storage connected - Click to manage';
        } else if (needsPermission) {
            indicator.title = 'Click to reconnect file storage';
        } else {
            indicator.title = 'Using browser storage - Click to connect folder';
        }
    }
    if (statusText) {
        if (connected) {
            statusText.textContent = 'File Storage';
        } else if (needsPermission) {
            statusText.textContent = 'Reconnect';
        } else {
            statusText.textContent = 'Browser Storage';
        }
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
