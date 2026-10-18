/**
 * DmToolPanelContainer
 * Draggable container that stacks DM tool panels (Fog, Walls, Lights)
 * vertically with no overlap. DM can drag the container header to
 * reposition it anywhere on the map canvas.
 */

import { useState, useRef, useCallback, useEffect, type ReactNode, type RefObject } from 'react';

interface DmToolPanelContainerProps {
  children: ReactNode;
  /** Ref to the map container element — the stack is placed and kept within it. */
  containerRef: RefObject<HTMLDivElement | null>;
}

/** Where the stack starts: the map's top right corner, under its toolbar. */
const CORNER_TOP = '3.5rem';
const CORNER_RIGHT = '0.5rem';
/**
 * Room kept below the stack for the Preview Player View button, which sits
 * 5rem above the map's bottom edge: that, its height and a gap. A taller
 * stack scrolls inside itself; it ran over the button and hid the Lights
 * panel's Place button behind it.
 */
const ROOM_BELOW = '8rem';
/** The stack is never cut shorter than this, wherever it is dropped. */
const SHORTEST = '6rem';

export default function DmToolPanelContainer({ children, containerRef }: DmToolPanelContainerProps) {
  // Where the stack was dropped, in pixels from the map container's top left
  // corner; null for its place in the top right corner. It was fixed to the
  // window, so it stayed put when the map moved or shrank and could be left
  // off the map.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /** The nearest position that keeps the whole stack on the map. */
  const onTheMap = useCallback((x: number, y: number) => {
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return { x, y };
    const map = container.getBoundingClientRect();
    const stack = panel.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(x, map.width - stack.width)),
      y: Math.max(0, Math.min(y, map.height - stack.height)),
    };
  }, [containerRef]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    const panel = panelRef.current;
    if (!container || !panel) return;
    const map = container.getBoundingClientRect();
    const stack = panel.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: stack.left - map.left, origY: stack.top - map.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [containerRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition(onTheMap(drag.origX + e.clientX - drag.startX, drag.origY + e.clientY - drag.startY));
  }, [onTheMap]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // The map changes size with the window and the side panels; a stack
  // dropped near its far edge is brought back onto it.
  const moved = position !== null;
  useEffect(() => {
    if (!moved) return undefined;
    const keepOnTheMap = () => setPosition((at) => {
      if (!at) return at;
      const next = onTheMap(at.x, at.y);
      return next.x === at.x && next.y === at.y ? at : next;
    });
    window.addEventListener('resize', keepOnTheMap);
    const container = containerRef.current;
    const observer = container && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(keepOnTheMap) : null;
    if (container) observer?.observe(container);
    return () => {
      window.removeEventListener('resize', keepOnTheMap);
      observer?.disconnect();
    };
  }, [moved, onTheMap, containerRef]);

  const top = position ? `${position.y}px` : CORNER_TOP;
  const style: React.CSSProperties = {
    position: 'absolute',
    ...(position ? { left: position.x, top: position.y } : { top: CORNER_TOP, right: CORNER_RIGHT }),
    zIndex: 30,
    maxHeight: `max(${SHORTEST}, calc(100% - ${top} - ${ROOM_BELOW}))`,
  };

  // One width for the stack, the one Walls and Lights take, so a section's
  // notes wrap instead of widening every panel when it is opened.
  return (
    <div ref={panelRef} style={style} className="flex flex-col gap-1.5 w-[200px] overflow-y-auto *:shrink-0">
      {/* Drag handle, kept in view while the panels below it scroll */}
      <div
        className="sticky top-0 z-10 flex items-center justify-center py-0.5 cursor-grab active:cursor-grabbing select-none rounded-t bg-stone-700 border border-stone-600/30 hover:bg-stone-600 transition-colors"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => setPosition(null)}
        title="Drag to move the panels; double-click to put them back in the corner"
      >
        <svg width="16" height="6" viewBox="0 0 16 6" className="opacity-40">
          <circle cx="4" cy="1.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="8" cy="1.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="12" cy="1.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="4" cy="4.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="8" cy="4.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="12" cy="4.5" r="1.2" fill="currentColor" className="text-stone-400" />
        </svg>
      </div>
      {children}
    </div>
  );
}
