/**
 * A section, or an entry in a list section, that can be dragged into a new place.
 *
 * framer-motion's own listener starts a drag from anywhere on an entry, and to
 * do it sets `touch-action: pan-x` and `user-select: none` on the entry, so on
 * a touch screen a vertical swipe that began on a section moved the section
 * and the page did not scroll. Here that listener is off and the drag is
 * started by hand: a mouse from anywhere on the entry but a text box, as
 * framer-motion did, selecting no text on the way; a finger or a pen from the
 * grip only, which is `touch-none` so the browser does not scroll under it.
 * Anywhere else a swipe scrolls.
 */
import type React from 'react';
import { Reorder, useDragControls } from 'framer-motion';

/** What the entry's grip takes: the handler that starts a drag by touch, and its classes. */
export interface DragGrip {
  onPointerDown: (event: React.PointerEvent) => void;
  className: string;
}

const TEXT_BOXES = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/** A box the mouse selects text in, where framer-motion started no drag either. */
function isTextBox(target: EventTarget): boolean {
  return target instanceof HTMLElement && (TEXT_BOXES.has(target.tagName) || target.isContentEditable);
}

interface DragEntryProps<T> {
  value: T;
  /** The entry, given what its grip needs. */
  children: (grip: DragGrip) => React.ReactNode;
}

export function DragEntry<T>({ value, children }: DragEntryProps<T>) {
  const controls = useDragControls();
  const grip: DragGrip = {
    onPointerDown: (event) => {
      // A mouse's press reaches the entry's own handler below.
      if (event.pointerType !== 'mouse') controls.start(event);
    },
    className: 'touch-none select-none',
  };
  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={controls}
      className="pointer-fine:select-none"
      onPointerDown={(event: React.PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        if (event.target !== event.currentTarget && isTextBox(event.target)) return;
        controls.start(event);
      }}
    >
      {children(grip)}
    </Reorder.Item>
  );
}
