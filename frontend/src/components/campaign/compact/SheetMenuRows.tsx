// ============================================
// SheetMenuRows: a menu's items as a sheet draws them
//
// The rows of an action sheet and of More: each command a row at least
// 52 px tall with its icon, in its tone (commandLook), a submenu's command
// with an arrow that opens its choices as a page of their own, a rule as a
// gap between groups, a heading as a group's label, and a line of text. The
// same MenuItems the desktop's popovers draw (components/ui/menu.ts), so a
// menu built once is offered the same way in either.
// ============================================

import { ChevronRight } from 'lucide-react';
import { commandLook, type MenuAction, type MenuCommand, type MenuItem, type MenuSubmenu, type SubmenuChoice } from '@/components/ui/menu';
import { cn } from '@/utils/cn';

export interface SheetMenuRowsProps {
  items: MenuItem[];
  /** Closes the sheet: called as a command is pressed, before it runs, unless it keeps the menu open. */
  onClose: () => void;
  /** A submenu's command was pressed; with none, a submenu's command does nothing. */
  onOpenSubmenu?: (item: MenuSubmenu) => void;
  /** Draws an arrow after every command, for a list whose rows each open something. */
  chevrons?: boolean;
}

/** A row's classes: 52 px or more, the width of the sheet, a rule under all but the last. */
export const SHEET_ROW =
  'flex w-full min-h-13 items-center gap-3 px-4 text-left text-base border-b border-ink/10 last:border-b-0 transition-colors focus:outline-hidden focus-visible:bg-ink/5 disabled:cursor-not-allowed';

function commandClass(item: MenuCommand): string {
  const { text, hover, dims } = commandLook(item);
  return cn(SHEET_ROW, text, hover, dims);
}

/** Runs a pressed action or submenu choice, closing the sheet first unless it keeps the menu open. */
export function pressRow(item: MenuAction | SubmenuChoice, onClose: () => void): void {
  if (!('keepsOpen' in item && item.keepsOpen)) onClose();
  item.run();
}

export default function SheetMenuRows({ items, onClose, onOpenSubmenu, chevrons = false }: SheetMenuRowsProps) {
  return (
    <>
      {items.map((item) => {
        switch (item.kind) {
          case 'separator':
            return <div key={item.id} role="separator" className="h-2 bg-ink/5" />;
          case 'heading':
            return (
              <p key={item.id} className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted select-none">
                {item.label}
              </p>
            );
          case 'text':
            return (
              <p key={item.id} className="px-4 py-3 text-sm italic text-ink-muted select-none">
                {item.label}
              </p>
            );
          case 'command': {
            const Icon = item.icon;
            const opens = item.children !== undefined;
            return (
              <button
                key={item.id}
                type="button"
                title={item.title}
                disabled={!opens && item.busy?.active}
                onClick={() => {
                  if (item.children) onOpenSubmenu?.(item);
                  else pressRow(item, onClose);
                }}
                className={commandClass(item)}
              >
                {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />}
                <span className="min-w-0 flex-1">{!opens && item.busy?.active ? item.busy.label : item.label}</span>
                {(opens || chevrons) && <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />}
              </button>
            );
          }
        }
      })}
    </>
  );
}
