// ============================================
// BottomSheet: a panel that rises over the map on a narrow screen
//
// The compact arrangement's Chat, Dice, Initiative, Party and More open in
// one of these, and the roll pickers do on a narrow screen. It has a grab
// handle, its title (which names it as a dialog) and a close X, and its
// content scrolls inside it.
//
// - Half height (50dvh, or the `halfHeight` given) leaves the map above it live: no backdrop, no focus
//   trap, so a player can watch, pinch and tap the map while reading the
//   chat. Escape closes it, unless something has used the key or a box is
//   being typed in, and its heading takes the focus as it opens, so no text
//   box raises a phone's keyboard by itself; a control inside it that has
//   the focus already keeps it.
// - Full height (from 3rem below the top) is modal: a backdrop that closes
//   it, the keyboard kept inside it (useFocusTrap, which also gives Escape
//   to the top dialog only), and it is a menu on the screen (openMenus.ts),
//   so the tap that closes it is not the first of a double tap to ping. A
//   half sheet made full keeps the focus where it was.
// - The handle: a drag down past 30 percent of the sheet closes it; with
//   `onHeightChange`, a drag up makes it full height, a short drag down makes
//   it half again, and a tap (or Enter) switches the two.
// - The browser's Back closes it, or a dialog opened over it first
//   (sheetHistory.ts).
// - On a tablet it is at most 672 px wide, centred. On a screen under 500 px
//   tall (a phone turned sideways) it comes from the right at full height,
//   with no handle; a half-height one stays as open to the map as it was.
// - It may keep its content mounted while closed (`open` false): the content
//   stays laid out, hidden (visibility: hidden once it has slid away) and
//   inert, so the chat inside it keeps scrolling to its newest message.
// - It slides in and out; with reduced motion it fades in place
//   (utils/motion.ts).
//
// Layers. The sheet and its backdrop are z-50 and drawn on the body
// (components/ui/FloatingLayer.tsx), the layer of a Modal's base and of a
// SlideOver's panel, and on the compact layout of a SlideOver's backdrop
// too (elsewhere it is z-40, under the panel). Among those, the one later
// in the body is in front: a Modal, a SlideOver or an ActionSheet opened
// from a sheet mounts after it, so it is put on the body after it and covers
// it, backdrop and all. A sheet kept mounted while closed went on the body
// when it first mounted, so a dialog opened before the sheet is opened
// stays in front of it.
//
// A sheet slides by a transform, and while it does the panel holds any
// `fixed` element inside it. The menus and pickers in the session and Party
// content are drawn on the body, so none is inside it.
// ============================================

import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useIsPresent, type TargetAndTransition, type Transition } from 'framer-motion';
import { X } from 'lucide-react';
import FloatingLayer from '@/components/ui/FloatingLayer';
import { menuShown } from '@/components/ui/openMenus';
import { isAnyTrapOpen, useFocusTrap } from '@/hooks/useFocusTrap';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SIDEWAYS_QUERY } from '@/constants/layout';
import { TAP_SLOP_PX } from '@/components/campaign/map/gestures';
import { isTypingInto } from '@/components/campaign/map/typingTarget';
import { useMotionExit } from '@/utils/motion';
import { cn } from '@/utils/cn';
import { sheetOpened, type SheetEntry } from './sheetHistory';

export type SheetHeight = 'half' | 'full';

/**
 * Where a sheet stops, as CSS lengths from the top and the bottom of the
 * screen: an arrangement's own sheets stop under its header and above its
 * bar, and leave both to be pressed. Without them a sheet stands on the
 * bottom of the screen and a full one comes up to 3rem from its top.
 */
export interface SheetEdges {
  top: string;
  bottom: string;
}

/** How far down a drag of the handle closes a sheet, as a share of the sheet's height. */
export const CLOSE_DRAG_SHARE = 0.3;
/** How far a drag of the handle moves a sheet between half and full height, as a share of its height. */
export const STEP_DRAG_SHARE = 0.1;
/** How far up the sheet follows a drag of its handle, in pixels. */
const DRAG_UP_PX = 24;

/** The widest a sheet is drawn, on a tablet: 672 px, centred. */
export const SHEET_WIDTH = 'mx-auto w-full max-w-2xl';

/**
 * What a drag of the handle `dy` pixels down (up when negative) on a sheet
 * `sheetPx` tall and `height` high comes to: closing it, or the height it
 * settles at. Only a sheet that may change height (`resizable`) changes it.
 */
export function settleDrag(dy: number, sheetPx: number, height: SheetHeight, resizable: boolean): SheetHeight | 'close' {
  if (dy > sheetPx * CLOSE_DRAG_SHARE) return 'close';
  if (!resizable) return height;
  if (height === 'half' && dy < -sheetPx * STEP_DRAG_SHARE) return 'full';
  if (height === 'full' && dy > sheetPx * STEP_DRAG_SHARE) return 'half';
  return height;
}

/**
 * What every sheet does while it is open, whatever it looks like. Back
 * closes it. A modal one holds the keyboard as a dialog does and is a menu
 * on the screen. One that is not modal closes on Escape while it is the
 * sheet on top and no dialog is over it. As it closes, a focus inside it
 * goes back to where it was as the sheet opened. Returns the ref for the
 * sheet's root, which holds the focus trap.
 */
export function useSheet(open: boolean, modal: boolean, onClose: () => void) {
  // A sheet made full height while open keeps the focus where it is.
  const rootRef = useFocusTrap(open && modal, onClose, { keepFocusInside: true });
  const close = useEffectEvent(() => onClose());
  const entryRef = useRef<SheetEntry | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const entry = sheetOpened(() => close());
    entryRef.current = entry;
    return () => {
      entryRef.current = null;
      entry.release();
    };
  }, [open]);

  useEffect(() => {
    if (!open || modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // A box being typed in may use Escape to cancel what is typed, as the
      // initiative tracker's does, without saying so.
      if (event.key !== 'Escape' || event.defaultPrevented || isAnyTrapOpen() || isTypingInto(event.target)) return;
      if (entryRef.current && !entryRef.current.isTop()) return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, modal]);

  useEffect(() => (open && modal ? menuShown() : undefined), [open, modal]);

  // The focus goes back as the sheet closes, in the commit that makes it
  // inert. React sets the attribute first, in its mutation phase; a browser
  // drops a focus left inside an inert element only as it next updates, so
  // moving it here, in a layout cleanup, is in time (not checked in a
  // browser). Then once more after the focus trap has let go: the trap gives
  // the focus to what had it as the trap began, which for a sheet made full
  // height from half is inside the sheet.
  const giveFocusBack = useEffectEvent(() => {
    const root = rootRef.current;
    const opener = openerRef.current;
    if (!root || !root.contains(document.activeElement)) return;
    if (opener && opener.isConnected && !root.contains(opener)) opener.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  useLayoutEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => giveFocusBack();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    return () => giveFocusBack();
  }, [open]);

  return rootRef;
}

/**
 * How a sheet comes and goes: it slides in from `from`, or fades in place
 * with reduced motion, and is hidden once it has gone. A sheet mounted
 * closed starts hidden, where it is.
 */
export function useSheetMotion(open: boolean, from: 'bottom' | 'right') {
  const away = useMotionExit(from === 'right' ? { x: '100%' } : { y: '100%' });
  const [mountedOpen] = useState(open);
  const shown: TargetAndTransition = { x: 0, y: 0, opacity: 1, visibility: 'visible' };
  const gone: TargetAndTransition = { ...away, transitionEnd: { visibility: 'hidden' } };
  const transition: Transition = { type: 'spring', damping: 32, stiffness: 320, opacity: { duration: 0.2 } };
  return {
    initial: mountedOpen ? away : { ...away, visibility: 'hidden' },
    animate: open ? shown : gone,
    transition,
  };
}

/**
 * The dimmed page behind a modal sheet, which closes the sheet when pressed.
 * While it fades out after the sheet has closed it takes no press, so one
 * on the map or the bar in that moment reaches them.
 */
export function SheetBackdrop({ open, top = '0px', bottom = '0px', onClose }: { open: boolean; top?: string; bottom?: string; onClose: () => void }) {
  return <AnimatePresence>{open && <FadingBackdrop key="sheet-backdrop" top={top} bottom={bottom} onClose={onClose} />}</AnimatePresence>;
}

function FadingBackdrop({ top, bottom, onClose }: { top: string; bottom: string; onClose: () => void }) {
  const present = useIsPresent();
  return (
    <motion.div
      data-sheet-backdrop=""
      aria-hidden="true"
      className="fixed inset-x-0 z-50 bg-black/50"
      style={{ top, bottom, pointerEvents: present ? undefined : 'none' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={present ? onClose : undefined}
    />
  );
}

export interface BottomSheetProps {
  open: boolean;
  /** The sheet's heading, which names it. */
  title: string;
  height: SheetHeight;
  /** Called by the X, Escape, the backdrop, a drag down and the browser's Back. */
  onClose: () => void;
  /** Given, the handle makes the sheet full or half height through it. */
  onHeightChange?: (height: SheetHeight) => void;
  /** Where the sheet stops; see SheetEdges. */
  edges?: SheetEdges;
  /** The dialog's id, for a control that opens it to name (aria-controls). */
  id?: string;
  /** How tall the sheet is at half height, as a CSS length: 50dvh unless given. */
  halfHeight?: string;
  children: ReactNode;
}

export function BottomSheet({ open, title, height, onClose, onHeightChange, edges, id, halfHeight = '50dvh', children }: BottomSheetProps) {
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  const modal = height === 'full';
  const rootRef = useSheet(open, modal, onClose);
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const motionProps = useSheetMotion(open, sideways ? 'right' : 'bottom');

  // As it opens, a sheet that is not modal gives its heading the focus; a
  // modal one's focus trap does, as the heading is marked data-autofocus. A
  // control inside it that has the focus already keeps it, as one does when
  // a tablet turned to the compact layout opens the sheet it is in.
  const focusHeading = useEffectEvent(() => {
    if (modal || rootRef.current?.contains(document.activeElement)) return;
    headingRef.current?.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => focusHeading());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // A drag of the handle: the sheet follows it, and where it is let go
  // decides (settleDrag). The click that ends a drag of the handle button
  // switches nothing.
  const dragRef = useRef<{ pointerId: number; startY: number; sheetPx: number; moved: boolean } | null>(null);
  const draggedRef = useRef(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);

  const grab = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const sheetPx = rootRef.current?.getBoundingClientRect().height ?? 0;
      dragRef.current = { pointerId: event.pointerId, startY: event.clientY, sheetPx, moved: false };
      draggedRef.current = false;
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.abs(dy) <= TAP_SLOP_PX) return;
      drag.moved = true;
      setDragOffset(Math.max(dy, -DRAG_UP_PX));
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragOffset(null);
      if (!drag.moved) return;
      draggedRef.current = true;
      const settled = settleDrag(event.clientY - drag.startY, drag.sheetPx, height, onHeightChange !== undefined);
      if (settled === 'close') onClose();
      else if (settled !== height) onHeightChange?.(settled);
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragOffset(null);
    },
  };

  // An arrangement's header and bar stay pressable beside its sheets, the
  // backdrop's included: on a phone on its side the bar's buttons are in
  // the header.
  const top = edges?.top ?? '0px';
  const bottom = edges?.bottom ?? '0px';
  const place: CSSProperties = sideways
    ? { top, bottom }
    : height === 'full'
      ? { top: `max(3rem, ${top})`, bottom }
      : { bottom, height: halfHeight, maxHeight: `calc(100dvh - max(3rem, ${top}) - ${bottom})` };
  if (dragOffset !== null) place.transform = `translateY(${dragOffset}px)`;

  const handleBar = <span aria-hidden="true" className="block h-1.5 w-10 rounded-full bg-ink-muted/40" />;
  // The handle is drawn 20 px tall, and takes a press 44 px tall.
  const handleClass = "relative mx-auto mt-2 flex h-5 w-16 shrink-0 touch-none items-center justify-center rounded-full after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']";

  return (
    <FloatingLayer>
      <SheetBackdrop open={open && modal} top={top} bottom={bottom} onClose={onClose} />
      <div
        ref={rootRef}
        id={id}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby={titleId}
        data-sheet=""
        data-state={open ? 'open' : 'closed'}
        inert={!open}
        className={cn(
          'fixed z-50 flex flex-col',
          sideways ? 'right-0 w-88 max-w-full' : `inset-x-0 ${SHEET_WIDTH}`,
          !open && 'pointer-events-none',
          dragOffset === null && 'transition-transform duration-150'
        )}
        style={place}
      >
        <motion.div
          {...motionProps}
          className={cn(
            'flex h-full min-h-0 flex-col overflow-hidden border border-brand/20 bg-surface-light shadow-2xl',
            sideways ? 'rounded-l-cozy-lg border-r-0' : 'rounded-t-cozy-lg border-b-0',
            !edges && 'pb-[env(safe-area-inset-bottom)]'
          )}
        >
          {!sideways &&
            (onHeightChange ? (
              <button
                type="button"
                {...grab}
                onClick={() => {
                  if (draggedRef.current) {
                    draggedRef.current = false;
                    return;
                  }
                  onHeightChange(height === 'half' ? 'full' : 'half');
                }}
                aria-label={height === 'half' ? `Make ${title} full height` : `Make ${title} half height`}
                title="Drag down to close"
                className={cn(handleClass, 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand')}
              >
                {handleBar}
              </button>
            ) : (
              <div {...grab} data-sheet-handle="" aria-hidden="true" className={handleClass}>
                {handleBar}
              </div>
            ))}

          <div className={cn('flex shrink-0 items-center gap-2 pl-4 pr-2', sideways && 'pt-1')}>
            <h2
              ref={headingRef}
              id={titleId}
              tabIndex={-1}
              data-autofocus=""
              className="min-w-0 flex-1 truncate font-heading text-lg font-bold text-brand-ink focus:outline-hidden"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-cozy text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div data-sheet-body="" className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </motion.div>
      </div>
    </FloatingLayer>
  );
}
