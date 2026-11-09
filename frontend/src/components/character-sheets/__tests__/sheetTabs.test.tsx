/**
 * The tab bars of the tabbed sheets.
 *
 * The D&D 5e sheet and editor, the Pathfinder 2e editor and the Call of
 * Cthulhu sheet and editor each wrote the same bar, a row of six or five tabs
 * that never wrapped inside a sheet that clips what overflows it. The D&D and
 * Pathfinder bars need about 810 and 850 px, so on a phone, and on an iPad held
 * upright, the last tabs were cut off and a finger could not reach them. All
 * five now draw one SheetTabs, which wraps onto a second row, or a third, where
 * the bar is too narrow; on a desktop it is one row as before. The open tab
 * is underlined in the header colour and labelled in the theme's text colour.
 *
 * The bar was buttons with the open one marked `aria-current`, so a screen
 * reader heard no tabs and the arrow keys did nothing. It is a row of tabs
 * now (`tablist`, `tab`, `aria-selected`) over the sheet's body as their
 * panel: the arrows open the tab before or after, Home and End the first and
 * the last, and Tab goes from the open tab into the sheet.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Swords, Target } from 'lucide-react';
import { SheetTabs, sheetTabPanel, type SheetTab } from '../SheetTabs';
import { DnD5eCharacterView } from '../dnd5e/DnD5eCharacterView';
import { DnD5eCharacterEditor } from '../dnd5e/DnD5eCharacterEditor';
import { Pathfinder2eCharacterEditor } from '../pathfinder2e/Pathfinder2eCharacterEditor';
import { CallOfCthulhu7eCharacterView } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterView';
import { CallOfCthulhu7eCharacterEditor } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const noop = () => Promise.resolve();
const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

describe.each([
  ['the D&D 5e sheet', () => render(<DnD5eCharacterView character={dnd5eCharacter()} />), 6],
  ['the D&D 5e editor', () => render(<DnD5eCharacterEditor character={dnd5eCharacter()} onSave={noop} onCancel={vi.fn()} />), 6],
  ['the Pathfinder 2e editor', () => render(<Pathfinder2eCharacterEditor character={pf2eCharacter()} onSave={noop} onCancel={vi.fn()} />), 6],
  ['the Call of Cthulhu sheet', () => render(<CallOfCthulhu7eCharacterView character={cocCharacter()} />), 5],
  ['the Call of Cthulhu editor', () => render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={noop} onCancel={vi.fn()} />), 5],
])('%s', (_name, show, count) => {
  it('draws its tabs with the shared bar, which wraps', () => {
    const { container } = show();
    const bars = container.querySelectorAll('[data-sheet-tabs]');
    expect(bars).toHaveLength(1);
    expect(classes(bars[0])).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-1']));
    expect(classes(bars[0])).not.toContain('space-x-1');
    expect(bars[0]).toHaveAttribute('role', 'tablist');
    expect(bars[0].querySelectorAll('[role=tab]')).toHaveLength(count);
  });

  it('is a row of tabs over the sheet as their panel, and the arrows open the next', () => {
    show();
    const tabs = screen.getAllByRole('tab');
    const open = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true');
    expect(open).toHaveLength(1);
    expect(open[0]).toBe(tabs[0]);
    expect(screen.getByRole('tabpanel', { name: tabs[0].textContent ?? '' })).toBeInTheDocument();

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    const next = screen.getAllByRole('tab')[1];
    expect(next).toHaveAttribute('aria-selected', 'true');
    expect(next).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: next.textContent ?? '' })).toBeInTheDocument();
  });
});

describe('SheetTabs', () => {
  type Id = 'stats' | 'combat';
  const TABS: SheetTab<Id>[] = [
    { id: 'stats', label: 'Stats & Skills', icon: Target },
    { id: 'combat', label: 'Combat', icon: Swords },
  ];

  const bar = (props: Partial<{ active: Id; onSelect: (id: Id) => void }> = {}) => (
    <SheetTabs id="sheet" tabs={TABS} active={props.active ?? 'stats'} onSelect={props.onSelect ?? vi.fn()} underline="#123456" />
  );

  it('opens the tab that is pressed', async () => {
    const onSelect = vi.fn();
    render(bar({ onSelect }));
    await userEvent.click(screen.getByRole('tab', { name: 'Combat' }));
    expect(onSelect).toHaveBeenCalledWith('combat');
  });

  it('underlines the open tab in the header colour and labels it in the theme text', () => {
    render(bar({ active: 'combat' }));
    const open = screen.getByRole('tab', { name: 'Combat' });
    expect(open).toHaveStyle({ borderBottomColor: '#123456' });
    expect(open).toHaveClass('text-ink', 'border-b-2');
    expect(open).toHaveAttribute('aria-selected', 'true');
    const closed = screen.getByRole('tab', { name: 'Stats & Skills' });
    expect(closed).toHaveClass('text-ink-secondary');
    expect(closed).toHaveAttribute('aria-selected', 'false');
  });

  it('is one stop for Tab, on the open tab, and names the panel it controls', () => {
    render(bar({ active: 'combat' }));
    expect(screen.getByRole('tablist')).toHaveAccessibleName('Sheet sections');
    expect(screen.getByRole('tab', { name: 'Combat' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Stats & Skills' })).toHaveAttribute('tabindex', '-1');
    for (const tab of screen.getAllByRole('tab')) expect(tab).toHaveAttribute('aria-controls', 'sheet-panel');
    expect(sheetTabPanel('sheet', 'combat')).toEqual({ role: 'tabpanel', id: 'sheet-panel', 'aria-labelledby': 'sheet-tab-combat' });
  });

  it('opens the tab before or after on an arrow, round the ends, and the first or last on Home or End', () => {
    const onSelect = vi.fn();
    render(bar({ onSelect }));
    const stats = screen.getByRole('tab', { name: 'Stats & Skills' });
    fireEvent.keyDown(stats, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('combat');
    expect(screen.getByRole('tab', { name: 'Combat' })).toHaveFocus();
    fireEvent.keyDown(stats, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('combat');
    fireEvent.keyDown(stats, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('stats');
    onSelect.mockClear();
    fireEvent.keyDown(stats, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('never submits a form it is in', () => {
    render(bar());
    for (const tab of screen.getAllByRole('tab')) expect(tab).toHaveAttribute('type', 'button');
  });
});

describe('the sheets', () => {
  const SOURCES = import.meta.glob(['/src/components/character-sheets/**/*.tsx', '!/src/**/__tests__/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('are read, so the check is looking at the right files', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
  });

  // One bar, so a change to it reaches every sheet; a copy would drift.
  it('write the tab bar only in SheetTabs', () => {
    const copies = Object.entries(SOURCES)
      .filter(([file, source]) => !file.endsWith('/SheetTabs.tsx') && /border-b-2 border-ink\/10 bg-ink\/5/.test(source))
      .map(([file]) => file);
    expect(copies).toEqual([]);
  });
});
