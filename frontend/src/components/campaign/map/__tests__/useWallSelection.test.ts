import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWallSelection } from '../useWallSelection';
import type { WallSegment } from '@/types/walls';

const walls: WallSegment[] = [
  { id: 'a', x1: 0, y1: 0, x2: 100, y2: 0, type: 'wall' },
  { id: 'b', x1: 100, y1: 0, x2: 200, y2: 0, type: 'door-closed' },
  { id: 'c', x1: 200, y1: 0, x2: 300, y2: 0, type: 'wall' },
];

function setup() {
  const commitWalls = vi.fn();
  const hook = renderHook(() => useWallSelection({ wallSegments: walls, commitWalls }));
  return { commitWalls, hook };
}

describe('useWallSelection', () => {
  it('moves only the selected walls and commits the whole list', () => {
    const { commitWalls, hook } = setup();
    act(() => hook.result.current.setSelectedWallIds(new Set(['a', 'c'])));
    act(() => hook.result.current.moveSelectedWalls(10, 5));
    expect(commitWalls).toHaveBeenCalledTimes(1);
    const next = commitWalls.mock.calls[0][0] as WallSegment[];
    expect(next.map((s) => [s.id, s.x1, s.y1])).toEqual([['a', 10, 5], ['b', 100, 0], ['c', 210, 5]]);
  });

  it('does nothing with nothing selected', () => {
    const { commitWalls, hook } = setup();
    act(() => hook.result.current.moveSelectedWalls(10, 5));
    act(() => hook.result.current.deleteSelectedWalls());
    expect(commitWalls).not.toHaveBeenCalled();
  });

  it('deletes the selection and clears it', () => {
    const { commitWalls, hook } = setup();
    act(() => hook.result.current.setSelectedWallIds(new Set(['b'])));
    act(() => hook.result.current.deleteSelectedWalls());
    expect((commitWalls.mock.calls[0][0] as WallSegment[]).map((s) => s.id)).toEqual(['a', 'c']);
    expect(hook.result.current.selectedWallIds.size).toBe(0);
  });

  it('reports one type only when the selection agrees', () => {
    const { hook } = setup();
    expect(hook.result.current.selectedSegmentType).toBeNull();
    act(() => hook.result.current.setSelectedWallIds(new Set(['a', 'c'])));
    expect(hook.result.current.selectedSegmentType).toBe('wall');
    act(() => hook.result.current.setSelectedWallIds(new Set(['a', 'b'])));
    expect(hook.result.current.selectedSegmentType).toBeNull();
  });
});
