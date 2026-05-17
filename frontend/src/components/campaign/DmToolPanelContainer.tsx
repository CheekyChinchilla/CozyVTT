/**
 * DmToolPanelContainer
 * Draggable container that stacks DM tool panels (Fog, Walls, Lights)
 * vertically with no overlap. DM can drag the container header to
 * reposition it anywhere on the map canvas.
 */

import { useState, useRef, useCallback, type ReactNode, type RefObject } from 'react';

interface DmToolPanelContainerProps {
  children: ReactNode;
  /** Ref to the map container element — used to clamp drag position within bounds. */
  containerRef: RefObject<HTMLDivElement | null>;
}

export default function DmToolPanelContainer({ children, containerRef }: DmToolPanelContainerProps) {
  // Position relative to the container's top-right corner (right, top offsets).
  // null = use default CSS position; set on first drag.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    // Current position: use existing or derive from DOM
    const curX = position?.x ?? rect.left;
    const curY = position?.y ?? rect.top;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: curX, origY: curY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    let newX = dragRef.current.origX + dx;
    let newY = dragRef.current.origY + dy;

    // Clamp within container bounds
    const container = containerRef.current;
    const panel = panelRef.current;
    if (container && panel) {
      const cRect = container.getBoundingClientRect();
      const pRect = panel.getBoundingClientRect();
      newX = Math.max(cRect.left, Math.min(newX, cRect.right - pRect.width));
      newY = Math.max(cRect.top, Math.min(newY, cRect.bottom - pRect.height));
    }

    setPosition({ x: newX, y: newY });
  }, [containerRef]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // When position is null (default), use absolute top-right placement via CSS.
  // When position is set, use fixed positioning from the drag.
  const style: React.CSSProperties = position
    ? { position: 'fixed', left: position.x, top: position.y, zIndex: 30 }
    : { position: 'absolute', top: '3.5rem', right: '0.5rem', zIndex: 30 };

  return (
    <div ref={panelRef} style={style} className="flex flex-col gap-1.5 max-h-[calc(100vh-5rem)] overflow-y-auto">
      {/* Drag handle */}
      <div
        className="flex items-center justify-center py-0.5 cursor-grab active:cursor-grabbing select-none rounded-t bg-stone-700/60 border border-stone-600/30 hover:bg-stone-700/80 transition-colors"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Drag to reposition panels"
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
