/**
 * The DM's wall undo history.
 *
 * MapCanvas stays mounted across a map switch, so the history did too: after
 * an edit on one map and a switch to another, Undo handed back the first
 * map's walls, and MapCanvas sent them as the new map's whole wall list. A
 * map switch now starts a fresh history.
 */

import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useWallHistory } from '../useWallHistory';
import type { WallSegment } from '@/types/walls';

const wall = (id: string, x = 0): WallSegment => ({ id, x1: x, y1: 0, x2: x + 50, y2: 0, type: 'wall' });

describe('useWallHistory', () => {
  it('has nothing to undo or redo after a reset, as after a map switch', () => {
    const { result } = renderHook(() => useWallHistory([]));
    act(() => { result.current.replace([wall('a1')]); });
    act(() => { result.current.push([wall('a1'), wall('a2')]); });
    act(() => { result.current.push([wall('a1')]); });
    act(() => { result.current.undo(); });
    expect(result.current.canRedo).toBe(true);

    const mapB = [wall('b1'), wall('b2')];
    act(() => { result.current.reset(mapB); });

    expect(result.current.walls).toEqual(mapB);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    let undone: WallSegment[] | null = [];
    act(() => { undone = result.current.undo(); });
    expect(undone).toBeNull();
    expect(result.current.walls).toEqual(mapB);
  });

  it('undoes as before once edits are made after a reset', () => {
    const { result } = renderHook(() => useWallHistory([]));
    act(() => { result.current.push([wall('a1')]); });
    act(() => { result.current.reset([wall('b1')]); });
    act(() => { result.current.push([wall('b1'), wall('b2')]); });

    let undone: WallSegment[] | null = null;
    act(() => { undone = result.current.undo(); });
    expect(undone).toEqual([wall('b1')]);
    expect(result.current.canUndo).toBe(false);
  });
});
