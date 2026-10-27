/**
 * DmToolPanelContainer
 * Draggable container that stacks DM tool panels (Fog, Walls, Lights)
 * vertically with no overlap. DM can drag the container header to
 * reposition it anywhere on the map canvas.
 */

import { useState, useRef, useCallback, useEffect, type ReactNode, type RefObject } from 'react';
import { stackCornerTop, type TopBand } from './map/toolbarLayout';

interface DmToolPanelContainerProps {
  children: ReactNode;
  /** Ref to the map container element — the stack is placed and kept within it. */
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * The band across the top of the map, measured: the stack's corner moves
   * under it when the toolbar wraps or its buttons reach the corner.
   */
  band?: TopBand | null;
}

/**
 * Where the stack starts: the map's top right corner, beside its toolbar,
 * or under it where the toolbar reaches the corner.
 */
const CORNER_TOP = '3.5rem';
/** The stack's gap from the map's right edge, and its one width, in pixels: set here and read for the toolbar's reach. */
const CORNER_RIGHT_PX = 8;
const STACK_WIDTH_PX = 200;
/**
 * Room kept below the stack for the Preview Player View button, which sits
 * 5rem above the map's bottom edge: that, its height and a gap. A taller
 * stack scrolls inside itself; it ran over the button and hid the Lights
 * panel's Place button behind it.
 */
const ROOM_BELOW = '8rem';
/** The stack is never cut shorter than this, wherever it is dropped. */
const SHORTEST = '6rem';

export default function DmToolPanelContainer({ children, containerRef, band = null }: DmToolPanelContainerProps) {
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

  const underBand = stackCornerTop(band, STACK_WIDTH_PX, CORNER_RIGHT_PX);
  const corner = underBand !== null ? `${underBand}px` : CORNER_TOP;
  const top = position ? `${position.y}px` : corner;
  const style: React.CSSProperties = {
    position: 'absolute',
    ...(position ? { left: position.x, top: position.y } : { top: corner, right: CORNER_RIGHT_PX }),
    width: STACK_WIDTH_PX,
    zIndex: 30,
    maxHeight: `max(${SHORTEST}, calc(100% - ${top} - ${ROOM_BELOW}))`,
  };

  // One width for the stack, the one Walls and Lights take, so a section's
  // notes wrap instead of widening every panel when it is opened.
  return (
    <div ref={panelRef} style={style} className="flex flex-col gap-1.5 overflow-y-auto *:shrink-0">
      {/* Drag handle, kept in view while the panels below it scroll. Taller
          for a finger on a touch screen, and it takes the touch itself:
          left to the browser, a finger's drag scrolled the stack and
          cancelled the move. Once moved, it offers Reset position, the
          double-click's way back, which a finger rarely lands; on a touch
          screen the bar then grows to hold the button's 44 pixels, which
          stood out of it, cut off above and over the first panel below. */}
      <div
        className={`sticky top-0 z-10 flex items-center justify-center py-0.5 ${position ? 'pointer-coarse:min-h-6' : 'pointer-coarse:h-6'} touch-none cursor-grab active:cursor-grabbing select-none rounded-t bg-stone-700 border border-stone-600/30 hover:bg-stone-600 transition-colors`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => setPosition(null)}
        title="Drag to move the panels; double-click to put them back in the corner"
      >
        <svg width="16" height="6" viewBox="0 0 16 6" className="opacity-40 mx-auto">
          <circle cx="4" cy="1.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="8" cy="1.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="12" cy="1.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="4" cy="4.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="8" cy="4.5" r="1.2" fill="currentColor" className="text-stone-400" />
          <circle cx="12" cy="4.5" r="1.2" fill="currentColor" className="text-stone-400" />
        </svg>
        {position && (
          <button
            type="button"
            // A press here is the button's, not the start of a move.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPosition(null)}
            title="Put the panels back in the corner"
            className="touch-target shrink-0 px-1.5 py-0.5 rounded-sm text-[10px] leading-none text-stone-300 hover:text-white hover:bg-stone-500/60 transition-colors"
          >
            Reset position
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
