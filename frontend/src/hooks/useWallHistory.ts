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
  undo: () => WallSegment[] | null;
  redo: () => WallSegment[] | null;
  canUndo: boolean;
  canRedo: boolean;
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
    undo,
    redo,
    canUndo: ws.idx > 0,
    canRedo: ws.idx < ws.stack.length - 1,
  };
}
