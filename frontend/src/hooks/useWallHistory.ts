/**
 * useWallHistory
 * Undo/redo stack for DM wall segment editing.
 * Maximum 50 history entries — oldest entries are dropped when the limit is exceeded.
 *
 * Uses a single atomic state object { stack, idx } to prevent the race condition
 * where rapid sequential pushes (e.g. split = remove + 2×add) all see the same
 * stale idx from the render they were created in.
 */

import { useState, useCallback } from 'react';
import type { WallSegment } from '@/types/walls';

const MAX_HISTORY = 50;

export interface WallHistoryResult {
  walls: WallSegment[];
  /** Replace current walls and push to history (clears redo stack). */
  push: (next: WallSegment[]) => void;
  /** Restore walls directly (e.g. from server sync) without pushing to history. */
  replace: (next: WallSegment[]) => void;
  /**
   * Start a fresh history at `next`, with nothing to undo or redo. For a map
   * switch: an older entry belongs to the previous map, and undoing to it
   * would send that map's walls as the new map's.
   */
  reset: (next: WallSegment[]) => void;
  /**
   * Apply a change that is not one of this page's undoable edits to every
   * entry: another person's or another tab's edit, a change made through the
   * API, or a door opened or closed. `change` gets the current walls and
   * returns them changed, and the same walls added and removed and fields
   * changed are made to the other entries, so undo and redo never put back
   * what it did.
   */
  carry: (change: (walls: WallSegment[]) => WallSegment[]) => void;
  undo: () => WallSegment[] | null;
  redo: () => WallSegment[] | null;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Make the change that turned `before` into `after` on another list of the
 * same map's walls: the walls it added, the ones it removed, and the fields
 * it changed on the rest. A wall the other list does not hold gets no field
 * changes, and one it already holds is not added twice.
 */
export function carryChange(before: WallSegment[], after: WallSegment[], walls: WallSegment[]): WallSegment[] {
  const was = new Map(before.map((w) => [w.id, w]));
  const now = new Set(after.map((w) => w.id));
  const removed = new Set(before.filter((w) => !now.has(w.id)).map((w) => w.id));
  const added = after.filter((w) => !was.has(w.id));
  const patches = new Map<string, Partial<WallSegment>>();
  for (const w of after) {
    const old = was.get(w.id);
    if (!old) continue;
    const patch: Partial<WallSegment> = {};
    const keys = new Set([...Object.keys(old), ...Object.keys(w)]) as Set<keyof WallSegment>;
    for (const key of keys) {
      if (old[key] !== w[key]) Object.assign(patch, { [key]: w[key] });
    }
    if (Object.keys(patch).length > 0) patches.set(w.id, patch);
  }
  if (removed.size === 0 && added.length === 0 && patches.size === 0) return walls;

  const kept = walls
    .filter((w) => !removed.has(w.id))
    .map((w) => {
      const patch = patches.get(w.id);
      return patch ? { ...w, ...patch } : w;
    });
  const held = new Set(kept.map((w) => w.id));
  return [...kept, ...added.filter((w) => !held.has(w.id))];
}

export function useWallHistory(initial: WallSegment[]): WallHistoryResult {
  // Atomic state: single object prevents the race condition where two rapid push()
  // calls in the same React batch each read the same stale idx.
  const [ws, setWs] = useState<{ stack: WallSegment[][], idx: number }>({
    stack: [initial], idx: 0,
  });

  // Push new entry: truncates redo stack, appends, trims to MAX_HISTORY.
  // Uses functional form exclusively — each call sees the result of the previous one,
  // even when multiple pushes are batched (e.g., split: remove + 2×add → 3 pushes).
  const push = useCallback((next: WallSegment[]) => {
    setWs(prev => {
      const trimmed = prev.stack.slice(0, prev.idx + 1).concat([next]);
      const final = trimmed.length > MAX_HISTORY
        ? trimmed.slice(trimmed.length - MAX_HISTORY)
        : trimmed;
      return { stack: final, idx: final.length - 1 };
    });
  }, []);

  // Replace current entry without pushing — used for external sync (e.g. server broadcast).
  const replace = useCallback((next: WallSegment[]) => {
    setWs(prev => {
      const stack = [...prev.stack];
      stack[prev.idx] = next;
      return { ...prev, stack };
    });
  }, []);

  const reset = useCallback((next: WallSegment[]) => {
    setWs({ stack: [next], idx: 0 });
  }, []);

  const carry = useCallback((change: (walls: WallSegment[]) => WallSegment[]) => {
    setWs(prev => {
      const before = prev.stack[prev.idx] ?? [];
      const after = change(before);
      if (after === before) return prev;
      const stack = prev.stack.map((walls, i) => (i === prev.idx ? after : carryChange(before, after, walls)));
      return { ...prev, stack };
    });
  }, []);

  // Undo: move idx back by 1. Returns the restored segments (or null if already at start).
  // Reads ws directly so the caller gets the correct wall list back synchronously.
  const undo = useCallback((): WallSegment[] | null => {
    if (ws.idx <= 0) return null;
    const newIdx = ws.idx - 1;
    setWs(prev => prev.idx <= 0 ? prev : { ...prev, idx: prev.idx - 1 });
    return ws.stack[newIdx];
  }, [ws]);

  // Redo: move idx forward by 1. Returns the restored segments (or null if at head).
  const redo = useCallback((): WallSegment[] | null => {
    if (ws.idx >= ws.stack.length - 1) return null;
    const newIdx = ws.idx + 1;
    setWs(prev => prev.idx >= prev.stack.length - 1 ? prev : { ...prev, idx: prev.idx + 1 });
    return ws.stack[newIdx];
  }, [ws]);

  return {
    walls: ws.stack[ws.idx] ?? initial,
    push,
    replace,
    reset,
    carry,
    undo,
    redo,
    canUndo: ws.idx > 0,
    canRedo: ws.idx < ws.stack.length - 1,
  };
}
