/**
 * The tab bars of the tabbed sheets.
 *
 * The D&D 5e sheet and editor, the Pathfinder 2e editor and the Call of
 * Cthulhu sheet and editor each wrote the same bar, a row of six or five tabs
 * that never wrapped inside a sheet that clips what overflows it. The D&D and
 * Pathfinder bars need about 810 and 850 px, so on a phone, and on an iPad held
 * upright, the last tabs were cut off and a finger could not reach them. All
 * five now draw one SheetTabs, which wraps onto a second row, or a third, where
 * the bar is too narrow; on a desktop it is one row as before. Tabs stay
 * buttons, with the open one marked for a screen reader, underlined in the
 * header colour and labelled in the theme's text colour.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Swords, Target } from 'lucide-react';
import { SheetTabs, type SheetTab } from '../SheetTabs';
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
    expect(bars[0].querySelectorAll('button')).toHaveLength(count);
  });

  it('marks the open tab for a screen reader', () => {
    const { container } = show();
    const marked = [...container.querySelectorAll('[data-sheet-tabs] button')].filter((tab) => tab.getAttribute('aria-current') === 'page');
    expect(marked).toHaveLength(1);
  });
});

describe('SheetTabs', () => {
  type Id = 'stats' | 'combat';
  const TABS: SheetTab<Id>[] = [
    { id: 'stats', label: 'Stats & Skills', icon: Target },
    { id: 'combat', label: 'Combat', icon: Swords },
  ];

  it('opens the tab that is pressed', async () => {
    const onSelect = vi.fn();
    render(<SheetTabs tabs={TABS} active="stats" onSelect={onSelect} underline="#1d4ed8" />);
    await userEvent.click(screen.getByRole('button', { name: 'Combat' }));
    expect(onSelect).toHaveBeenCalledWith('combat');
  });

  it('underlines the open tab in the header colour and labels it in the theme text', () => {
    render(<SheetTabs tabs={TABS} active="combat" onSelect={vi.fn()} underline="#123456" />);
    const open = screen.getByRole('button', { name: 'Combat' });
    expect(open).toHaveStyle({ borderBottomColor: '#123456' });
    expect(open).toHaveClass('text-ink', 'border-b-2');
    expect(open).toHaveAttribute('aria-current', 'page');
    const closed = screen.getByRole('button', { name: 'Stats & Skills' });
    expect(closed).toHaveClass('text-ink-secondary');
    expect(closed).not.toHaveAttribute('aria-current');
  });

  it('never submits a form it is in', () => {
    render(<SheetTabs tabs={TABS} active="stats" onSelect={vi.fn()} underline="#123456" />);
    for (const tab of screen.getAllByRole('button')) expect(tab).toHaveAttribute('type', 'button');
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
