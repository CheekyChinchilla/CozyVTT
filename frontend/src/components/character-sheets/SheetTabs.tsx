/**
 * The tab bar of a tabbed character sheet, its editor's too.
 *
 * It wraps: where six tabs do not fit on one row, as on a phone or an iPad
 * held upright, the rest go onto a second row, or a third, and every tab
 * stays where a finger reaches it. On a desktop they fit one row. The open
 * tab is underlined in the header colour and labelled in the theme's text
 * colour.
 *
 * It is a row of tabs for a screen reader (`tablist`, `tab`, `aria-selected`)
 * and the keyboard: the open tab is the one stop for Tab, the arrows open the
 * tab before or after, round the ends, and Home and End the first and the
 * last (`tabKeyTarget`). The sheet's body is their panel: the sheet spreads
 * `sheetTabPanel(id, active)` on it, with the `id` it gave the bar.
 */
import { useRef, type ElementType } from 'react';
import { tabKeyTarget } from '@/utils/tabKeys';

export interface SheetTab<Id extends string> {
  id: Id;
  label: string;
  icon: ElementType;
}

interface SheetTabsProps<Id extends string> {
  /** Unique on the page (`useId`): names the tabs and the panel. */
  id: string;
  tabs: readonly SheetTab<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  /** The header colour, a CSS colour, drawn as the open tab's underline. */
  underline: string;
}

const tabId = (id: string, tab: string) => `${id}-tab-${tab}`;
const panelId = (id: string) => `${id}-panel`;

/** What the sheet's body carries as the panel of the bar named `id`, showing `active`. */
export function sheetTabPanel(id: string, active: string) {
  return { role: 'tabpanel', id: panelId(id), 'aria-labelledby': tabId(id, active) } as const;
}

export function SheetTabs<Id extends string>({ id, tabs, active, onSelect, underline }: SheetTabsProps<Id>) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = tabKeyTarget(event.key, index, tabs.length);
    if (target === null) return;
    event.preventDefault();
    onSelect(tabs[target].id);
    tabRefs.current[target]?.focus();
  };

  return (
    <div data-sheet-tabs role="tablist" aria-label="Sheet sections" className="flex flex-wrap gap-1 border-b-2 border-ink/10 bg-ink/5 px-4">
      {tabs.map(({ id: tab, label, icon: Icon }, index) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            ref={(button) => { tabRefs.current[index] = button; }}
            type="button"
            role="tab"
            id={tabId(id, tab)}
            aria-selected={isActive}
            aria-controls={panelId(id)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors ${
              isActive ? 'text-ink border-b-2 -mb-0.5 bg-paper' : 'text-ink-secondary hover:text-ink hover:bg-ink/10'
            }`}
            style={isActive ? { borderBottomColor: underline } : undefined}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
