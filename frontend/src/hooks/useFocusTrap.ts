// ============================================
// useFocusTrap — Accessibility hook for modals
// ============================================
//
// Traps keyboard focus inside a container when `isOpen` is true.
// Restores focus to the previously focused element on close.
// Handles Escape key to close the modal.
//
// With one dialog open over another, only the top one acts on a key. Every
// open trap listens on the document, so each used to act: Escape closed them
// all, and on Tab the lower one pulled focus to its own first control, which
// the top one then pulled back to its first, so its other controls could not
// be reached. A field that should take focus as a dialog opens carries
// `data-autofocus`, which the trap focuses. React's `autoFocus` moves focus
// before the trap records where it came from, so focus could not return to
// the opener, and the trap then moved it to the first control anyway.
//
// On the campaign page's compact layout the browser's Back closes the dialog
// on top as Escape does (components/campaign/compact/sheetHistory.ts), so an
// open trap there holds a place on the history; the desktop's is untouched.

import { useEffect, useRef } from 'react';
import { useCompactLayout } from '@/contexts/LayoutContext';
import { dialogOpened, nextOpening } from '@/components/campaign/compact/sheetHistory';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** An open trap, known by its identity. */
type OpenTrap = object;

/** The open traps, oldest first; only the last acts on a key. */
const openTraps: OpenTrap[] = [];

/**
 * Whether any dialog's focus trap is open. The map's keys stand aside while
 * one is: the trap takes only Tab and Escape, so arrows and the rest would
 * otherwise reach the map behind the dialog.
 */
export function isAnyTrapOpen(): boolean {
  return openTraps.length > 0;
}

export interface FocusTrapOptions {
  /**
   * Leave the focus where it is as the trap begins when it is already inside
   * the container: a panel that becomes a dialog while open, such as a sheet
   * made full height, keeps the control in use.
   */
  keepFocusInside?: boolean;
  /**
   * Whether the browser's Back closes the dialog on the compact layout,
   * through the close Escape calls. True unless set false, as a sheet that
   * answers Back itself does (compact/BottomSheet.tsx).
   */
  closesOnBack?: boolean;
}

/**
 * Traps keyboard focus inside a dialog container.
 *
 * @param isOpen  Whether the modal is currently open
 * @param onClose Called when the user presses Escape
 * @returns A ref to attach to the modal's root element
 */
export function useFocusTrap(isOpen: boolean, onClose?: () => void, options: FocusTrapOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Keep a stable ref to the latest onClose callback.
  // This prevents the effect from re-running every time the parent re-renders
  // (which would steal focus from inputs on every keystroke).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const keepFocusInsideRef = useRef(options.keepFocusInside === true);
  keepFocusInsideRef.current = options.keepFocusInside === true;
  const closesOnBack = useCompactLayout() && options.closesOnBack !== false;

  // When the trap opened, among the dialogs and sheets (sheetHistory's
  // nextOpening), so its hold on the history keeps its place.
  const openedRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;

    const trap: OpenTrap = {};
    openTraps.push(trap);
    openedRef.current = nextOpening();

    // Remember the element that had focus before the modal opened
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the marked field, or else the first focusable element, after the
    // DOM has settled
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      if (keepFocusInsideRef.current && container.contains(document.activeElement)) return;

      const first =
        container.querySelector<HTMLElement>('[data-autofocus]') ??
        container.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
      if (first) {
        first.focus();
      } else {
        // If nothing is focusable, make the container itself focusable
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (openTraps[openTraps.length - 1] !== trap) return;

      // Escape closes the modal, and nothing behind it sees the key
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (onCloseRef.current) {
          e.preventDefault();
          onCloseRef.current();
        }
        return;
      }

      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      );

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab: wrap from first → last
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: wrap from last → first
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      openTraps.splice(openTraps.indexOf(trap), 1);
      // Restore focus to the element that was focused before the modal opened
      previousFocusRef.current?.focus();
    };
  // onCloseRef is stable (created by useRef) — no need to include it.
   
  }, [isOpen]);

  // Its own effect, so a layout that changes while the dialog is open takes
  // or gives back the history's entry without the trap starting over. After
  // the trap's, which takes the dialog's place as it opens.
  useEffect(() => {
    if (!isOpen || !closesOnBack) return;
    const entry = dialogOpened(() => onCloseRef.current?.(), openedRef.current);
    return () => entry.release();
  }, [isOpen, closesOnBack]);

  return containerRef;
}
