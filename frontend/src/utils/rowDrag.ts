import type React from 'react';

/**
 * A row dragged by its grip (`data-drag-grip`) shows the whole row under the
 * pointer, as a drag that starts anywhere else on the row does; the grip
 * alone would be a few pixels of icon. Call it from the row's dragstart.
 */
export function showRowWhileDraggedByGrip(e: React.DragEvent<HTMLElement>): void {
  if (!(e.target instanceof Element) || !e.target.closest('[data-drag-grip]')) return;
  const row = e.currentTarget;
  const box = row.getBoundingClientRect();
  e.dataTransfer?.setDragImage?.(row, e.clientX - box.left, e.clientY - box.top);
}
