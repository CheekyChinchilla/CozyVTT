/**
 * The tab bar of a tabbed character sheet, its editor's too.
 *
 * It wraps: where six tabs do not fit on one row, as on a phone or an iPad
 * held upright, the rest go onto a second row, or a third, and every tab
 * stays where a finger reaches it. On a desktop they fit one row. The tabs
 * are buttons, the open one marked with `aria-current`, underlined in the
 * header colour and labelled in the theme's text colour.
 */
import type { ElementType } from 'react';

export interface SheetTab<Id extends string> {
  id: Id;
  label: string;
  icon: ElementType;
}

interface SheetTabsProps<Id extends string> {
  tabs: readonly SheetTab<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  /** The header colour, a CSS colour, drawn as the open tab's underline. */
  underline: string;
}

export function SheetTabs<Id extends string>({ tabs, active, onSelect, underline }: SheetTabsProps<Id>) {
  return (
    <div data-sheet-tabs className="flex flex-wrap gap-1 border-b-2 border-ink/10 bg-ink/5 px-4">
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors ${
              isActive ? 'text-ink border-b-2 -mb-0.5 bg-paper' : 'text-ink-secondary hover:text-ink hover:bg-ink/10'
            }`}
            style={isActive ? { borderBottomColor: underline } : undefined}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
