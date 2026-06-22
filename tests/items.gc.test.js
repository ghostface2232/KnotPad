import { describe, it, expect, beforeEach } from 'vitest';
import * as state from '../js/state.js';
import { gcOrphanMedia } from '../js/items.js';

// Helpers: a media-bearing item, and a history snapshot referencing media ids.
const mediaItem = id => ({ type: 'image', content: id });
const snapshot = (...ids) => ({ items: ids.map(mediaItem), connections: [] });

beforeEach(() => {
  state.items.length = 0;
  state.setUndoStack([]);
  state.setRedoStack([]);
  state.pendingMediaDeletes.clear();
  state.blobURLCache.clear();
});

// gcOrphanMedia() sweeps a pending id only when it is unreferenced by live
// items AND every in-memory undo/redo snapshot. After a sweep the id is removed
// from pendingMediaDeletes; a kept id remains pending. We assert on that set,
// which directly reflects the reference-scan decision (the regression-prone part).
describe('gcOrphanMedia (deferred media GC)', () => {
  it('is a no-op when nothing is pending', () => {
    state.items.push(mediaItem('media_a'));
    gcOrphanMedia();
    expect(state.pendingMediaDeletes.size).toBe(0);
  });

  it('keeps media still referenced by a live item', () => {
    state.items.push(mediaItem('media_a'));
    state.pendingMediaDeletes.add('media_a');
    gcOrphanMedia();
    expect(state.pendingMediaDeletes.has('media_a')).toBe(true);
  });

  it('sweeps media not referenced anywhere', () => {
    state.pendingMediaDeletes.add('media_orphan');
    gcOrphanMedia();
    expect(state.pendingMediaDeletes.has('media_orphan')).toBe(false);
  });

  it('keeps media referenced only by an undo snapshot (T1-2/T1-3)', () => {
    state.setUndoStack([snapshot('media_a')]);
    state.pendingMediaDeletes.add('media_a');
    gcOrphanMedia();
    expect(state.pendingMediaDeletes.has('media_a')).toBe(true);
  });

  it('keeps media referenced only by a REDO snapshot (regression: redo must be scanned)', () => {
    state.setRedoStack([snapshot('media_b')]);
    state.pendingMediaDeletes.add('media_b');
    gcOrphanMedia();
    expect(state.pendingMediaDeletes.has('media_b')).toBe(true);
  });

  it('sweeps once the last reference is evicted', () => {
    state.setUndoStack([snapshot('media_a')]);
    state.pendingMediaDeletes.add('media_a');
    gcOrphanMedia();
    expect(state.pendingMediaDeletes.has('media_a')).toBe(true);

    state.setUndoStack([]); // history evicted, no references remain
    gcOrphanMedia();
    expect(state.pendingMediaDeletes.has('media_a')).toBe(false);
  });

  it('does not delete shared media while a duplicate still lives (T1-4)', () => {
    // duplicateItem deep-copies content, so two live items can share one media id.
    state.items.push(mediaItem('media_shared'), mediaItem('media_shared'));
    state.pendingMediaDeletes.add('media_shared'); // one copy deleted
    gcOrphanMedia();
    expect(state.pendingMediaDeletes.has('media_shared')).toBe(true);

    state.items.length = 0; // delete the remaining copy
    gcOrphanMedia();
    expect(state.pendingMediaDeletes.has('media_shared')).toBe(false);
  });
});

// Canvas switch must drop pending tracking (keep bytes) rather than GC, because
// the leaving canvas's undo/redo stacks are persisted to localStorage and may
// still reference these media (T1-5).
describe('clearItemsAndConnections preserves cross-canvas history (T1-5)', () => {
  it('drops pending-delete tracking instead of hard-deleting', () => {
    state.pendingMediaDeletes.add('media_a');
    state.pendingMediaDeletes.add('media_b');
    state.clearItemsAndConnections();
    expect(state.pendingMediaDeletes.size).toBe(0);
  });
});
