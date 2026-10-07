/**
 * The DM's wall undo history.
 *
 * MapCanvas stays mounted across a map switch, so the history did too: after
 * an edit on one map and a switch to another, Undo handed back the first
 * map's walls, and MapCanvas sent them as the new map's whole wall list. A
 * map switch now starts a fresh history.
 *
 * A change that is not one of the DM's own edits, such as a player opening a
 * door, is carried into every entry, so undoing the DM's last edit does not
 * close the door again for everyone.
 */

import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useWallHistory, carryChange } from '../useWallHistory';
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

describe('carry', () => {
  it("keeps another person's door toggle through undo and redo", () => {
    const door: WallSegment = { ...wall('d1'), type: 'door-closed' };
    const { result } = renderHook(() => useWallHistory([]));
    act(() => { result.current.reset([door, wall('w1', 100)]); });
    // The DM moves the door.
    act(() => { result.current.push([{ ...door, x1: 10, x2: 60 }, wall('w1', 100)]); });
    // A player opens it.
    act(() => { result.current.carry((walls) => walls.map((w) => (w.id === 'd1' ? { ...w, type: 'door-open' } : w))); });

    let undone: WallSegment[] | null = null;
    act(() => { undone = result.current.undo(); });
    expect(undone).toEqual([{ ...door, type: 'door-open' }, wall('w1', 100)]);

    let redone: WallSegment[] | null = null;
    act(() => { redone = result.current.redo(); });
    expect(redone).toEqual([{ ...door, x1: 10, x2: 60, type: 'door-open' }, wall('w1', 100)]);
  });

  it('carries walls added and removed elsewhere into older entries', () => {
    const { result } = renderHook(() => useWallHistory([]));
    act(() => { result.current.reset([wall('w1'), wall('w2', 100)]); });
    act(() => { result.current.push([wall('w1'), wall('w2', 100), wall('mine', 200)]); });
    act(() => { result.current.carry((walls) => [...walls.filter((w) => w.id !== 'w2'), wall('theirs', 300)]); });

    let undone: WallSegment[] | null = null;
    act(() => { undone = result.current.undo(); });
    expect(undone).toEqual([wall('w1'), wall('theirs', 300)]);
  });
});

describe('carryChange', () => {
  it('leaves a list alone when nothing changed', () => {
    const list = [wall('w1')];
    expect(carryChange(list, [...list], list)).toBe(list);
  });

  it('changes only the fields that changed, on walls the list holds', () => {
    const before = [wall('w1'), wall('w2', 100)];
    const after = [{ ...wall('w1'), type: 'window' as const }, wall('w2', 100)];
    const older = [{ ...wall('w1'), x2: 999 }];
    expect(carryChange(before, after, older)).toEqual([{ ...wall('w1'), x2: 999, type: 'window' }]);
  });

  it('does not add a wall twice', () => {
    expect(carryChange([], [wall('w1')], [wall('w1')])).toEqual([wall('w1')]);
  });
});
