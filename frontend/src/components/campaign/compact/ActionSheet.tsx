// ============================================
// ActionSheet: a menu as a sheet, on a narrow screen
//
// The token, door and character menus open in one of these on the compact
// layout, in place of the popover at the pointer: a modal sheet from the
// bottom of the screen with a header (what the menu is on, and a line
// about it), the menu's rows (SheetMenuRows), and Cancel on a card of its
// own. It draws the same MenuItems as the desktop's popovers. A submenu's
// command opens its choices as a second page, under the submenu's name,
// with a row back to the first ("Back to" the sheet's title).
//
// It is a sheet as BottomSheet is (useSheet): a backdrop and Cancel close
// it, the focus trap holds the keyboard and gives Escape to it, its first
// item takes the focus, as the popover's does when the keyboard opened it,
// the browser's Back closes it, and it is a menu on the screen. It is drawn
// on the body at z-50, so one opened from a sheet is put on the body after
// that sheet and covers it. A press on an item closes it before the item
// runs, unless the item keeps the menu open. The popovers close on a click
// or a press anywhere in the window; a menu drawn as an action sheet leaves
// those closers off, or a press on a row that keeps the menu open would
// close it.
// ============================================

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import FloatingLayer from '@/components/ui/FloatingLayer';
import type { MenuItem, MenuSubmenu } from '@/components/ui/menu';
import { cn } from '@/utils/cn';
import { SHEET_WIDTH, SheetBackdrop, useSheet, useSheetMotion } from './BottomSheet';
import SheetMenuRows, { SHEET_ROW, pressRow } from './SheetMenuRows';

export interface ActionSheetProps {
  open: boolean;
  /** What the menu is on, which names the sheet. */
  title: string;
  items: MenuItem[];
  /** Called by Cancel, the backdrop, Escape, the browser's Back and every item that does not keep the menu open. */
  onClose: () => void;
  /** A line under the title: whose it is, its hit points. */
  subtitle?: string;
  /** Drawn before the title, such as the token's picture. */
  leading?: ReactNode;
  /**
   * Told, as the sheet opens, how far down the page its top stands, so the
   * caller can keep what the menu is on in sight above it.
   */
  onPlaced?: (top: number) => void;
}

/** A pictograph and the space after it, at the start of a label (the door menu's 🚪). */
const LEADING_PICTOGRAPH = /^(\p{Extended_Pictographic}\uFE0F?)\s*/u;

/**
 * A menu whose first row is its heading, such as the door menu's state, as
 * an action sheet takes it: the heading as the sheet's title and the rest as
 * its rows, with a pictograph the heading starts with apart (`mark`), to be
 * shown and not read as part of the sheet's name. A menu with no heading
 * keeps its rows and takes `fallback`.
 */
export function headedMenu(items: MenuItem[], fallback: string): { title: string; mark?: string; items: MenuItem[] } {
  const [first, ...rest] = items;
  if (first?.kind !== 'heading') return { title: fallback, items };
  const pictograph = LEADING_PICTOGRAPH.exec(first.label);
  return pictograph
    ? { title: first.label.slice(pictograph[0].length), mark: pictograph[1], items: rest }
    : { title: first.label, items: rest };
}

export default function ActionSheet({ open, title, items, onClose, subtitle, leading, onPlaced }: ActionSheetProps) {
  const rootRef = useSheet(open, true, onClose);
  // Its root is laid out where the sheet ends up; only the card inside slides.
  const placed = useEffectEvent((top: number) => onPlaced?.(top));
  useLayoutEffect(() => {
    if (open && rootRef.current) placed(rootRef.current.getBoundingClientRect().top);
  }, [open, rootRef]);
  const motionProps = useSheetMotion(open, 'bottom');
  const titleId = useId();
  const pageRef = useRef<HTMLDivElement>(null);
  // The submenu whose choices are the page shown, by its command's id: read
  // from the items each time, so a wait that ends shows the choices.
  const [submenuId, setSubmenuId] = useState<string | null>(null);
  const submenu = items.find((item): item is MenuSubmenu => item.kind === 'command' && item.id === submenuId && item.children !== undefined);

  // A new page puts the focus on its first control, as opening the sheet does.
  const [pageTurns, setPageTurns] = useState(0);
  useEffect(() => {
    if (pageTurns === 0) return;
    pageRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });
  }, [pageTurns]);
  const turnTo = (id: string | null) => {
    setSubmenuId(id);
    setPageTurns((n) => n + 1);
  };

  return (
    <FloatingLayer>
      <SheetBackdrop open={open} onClose={onClose} />
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-action-sheet=""
        data-state={open ? 'open' : 'closed'}
        inert={!open}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
          SHEET_WIDTH,
          !open && 'pointer-events-none'
        )}
        // A held Enter that opened the menu must not press its first item,
        // which takes the focus as the sheet opens; as the popover's guard.
        onKeyDown={(event) => { if (event.key === 'Enter' && event.repeat) event.preventDefault(); }}
      >
        <motion.div {...motionProps} className="flex max-h-[calc(100dvh-1rem)] flex-col gap-2">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-cozy-lg border border-brand/20 bg-surface-light shadow-2xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-ink/10 px-4 py-3">
              {leading}
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="truncate font-heading text-lg font-bold text-brand-ink">
                  {title}
                </h2>
                {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
              </div>
            </div>

            <div ref={pageRef} data-action-sheet-page="" className="min-h-0 overflow-y-auto overscroll-contain">
              {submenu ? (
                <>
                  <button type="button" onClick={() => turnTo(null)} className={cn(SHEET_ROW, 'font-medium text-ink-secondary hover:bg-ink/5')}>
                    <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">Back to {title}</span>
                  </button>
                  <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted select-none">{submenu.label}</p>
                  {submenu.busy?.active ? (
                    <p className="px-4 py-3 text-sm text-ink-muted">{submenu.busy.label}</p>
                  ) : (
                    submenu.children.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => pressRow(choice, onClose)}
                        className={cn(SHEET_ROW, 'text-ink hover:bg-ink/5')}
                      >
                        <span className="min-w-0 flex-1">{choice.label}</span>
                      </button>
                    ))
                  )}
                </>
              ) : (
                <SheetMenuRows items={items} onClose={onClose} onOpenSubmenu={(item) => turnTo(item.id)} />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-13 shrink-0 rounded-cozy-lg border border-brand/20 bg-surface-light text-base font-semibold text-ink shadow-2xl transition-colors hover:bg-ink/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
          >
            Cancel
          </button>
        </motion.div>
      </div>
    </FloatingLayer>
  );
}
