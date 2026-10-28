/**
 * The Call of Cthulhu sheet's body on a phone.
 *
 * On a phone about 300 px is left for a tab's content. The eight
 * characteristics kept four to a row, about 63 px for a block 74 px wide; the
 * current hit points, magic points and Luck kept three; a skill row's base,
 * value and half and fifth left its name about 90 px; a contact's role box
 * kept 160 px beside the name; and the wealth's three figures kept three
 * columns. Below `sm` each now has a layout of its own; from `sm` up the
 * classes that drew the old one are all still there, behind `sm:` where they
 * changed, and a row that wraps on a phone keeps to one line
 * (`sm:flex-nowrap`). A remove button on a row is 44 px on a touch screen. jsdom
 * evaluates no media query, so the classes are asserted; the screenshots show
 * the layout.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import { CallOfCthulhu7eCharacterView } from '../CallOfCthulhu7eCharacterView';
import { cocCharacter, COC_BLANK_SHEET } from './cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const noop = () => Promise.resolve();
const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

function above(from: Element, want: string[]): Element {
  let at = from.parentElement;
  while (at && !want.every((c) => classes(at).includes(c))) at = at.parentElement;
  if (!at) throw new Error(`nothing above with ${want.join(' ')}`);
  return at;
}

const columns = (grid: Element, phone: string, desk: string) => {
  expect(classes(grid)).toEqual(expect.arrayContaining(['grid', phone, desk]));
  expect(classes(grid)).not.toContain(desk.replace(/^sm:/, ''));
};

/** A row that wraps on a phone and keeps to one line from sm up, as it did. */
const wraps = (row: Element | null) => {
  expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'sm:flex-nowrap']));
  expect(classes(row).some((c) => /^space-x-/.test(c))).toBe(false);
};

const sheet = () =>
  cocCharacter({
    skills: {
      ...(COC_BLANK_SHEET.skills as Record<string, unknown>),
      languageOther: [{ baseValue: 1, currentValue: 1, improvementChecked: false, language: 'Latin' }],
    },
    combat: { weapons: [{ name: 'Fist', skill: 'Brawl', skillValue: 25, damage: '1d3+DB', range: 'Touch', attacks: 1 }] },
    contacts: [{ name: 'Miss Ada', role: 'Librarian', notes: '' }],
  });

async function editorOn(tab?: string) {
  const view = render(<CallOfCthulhu7eCharacterEditor character={sheet()} onSave={noop} onCancel={vi.fn()} />);
  if (tab) await userEvent.click(screen.getByRole('button', { name: tab }));
  return view;
}

/** The characteristics: three to a row, four from sm up, eight from md up. */
const characteristicsGrid = (grid: Element) => {
  expect(classes(grid)).toEqual(expect.arrayContaining(['grid-cols-3', 'sm:grid-cols-4', 'md:grid-cols-8']));
  expect(classes(grid)).not.toContain('grid-cols-4');
};

describe('the Call of Cthulhu editor on a phone', () => {
  it('lists the characteristics three to a row', async () => {
    await editorOn();
    characteristicsGrid(above(screen.getByLabelText('STR'), ['grid']));
  });

  it('puts current hit points and magic points side by side, and Luck under them', async () => {
    const { container } = await editorOn();
    columns(above(container.querySelector('#coc-current-hp')!, ['grid']), 'grid-cols-2', 'sm:grid-cols-3');
    const luck = above(container.querySelector('#coc-luck')!, ['bg-paper']);
    expect(classes(luck)).toEqual(expect.arrayContaining(['col-span-2', 'sm:col-span-1']));
  });

  it('wraps the Sanity heading and its figures', async () => {
    await editorOn();
    const heading = screen.getByRole('heading', { name: 'Sanity Points' });
    wraps(heading.parentElement!.parentElement);
  });

  describe('Skills', () => {
    it('puts a skill\'s name on a line of its own, its numbers under it, and the one line from sm up', async () => {
      await editorOn('Skills');
      const row = screen.getByLabelText('Value of Accounting').closest('.group')!;
      wraps(row);
      expect(classes(row)).toEqual(expect.arrayContaining(['gap-x-2', 'sm:flex-nowrap']));
      const [, name, base] = [...row.children];
      expect(classes(name)).toEqual(expect.arrayContaining(['basis-[calc(100%-1.75rem)]', 'sm:basis-0']));
      expect(classes(base)).toEqual(expect.arrayContaining(['ml-7', 'sm:ml-0']));
    });

    it('lays the header out as the rows are, so its labels stay over their columns on a phone', async () => {
      await editorOn('Skills');
      const header = screen.getByText('Skill Name').parentElement!;
      const row = screen.getByLabelText('Value of Accounting').closest('.group')!;
      const wrapping = (element: Element) => classes(element).filter((c) => /^(?:sm:)?(?:flex-wrap|flex-nowrap|gap-)/.test(c));
      const placing = (element: Element) => classes(element).filter((c) => /^(?:[\w-]+:)*(?:w-|min-w-|basis-|ml-|flex-1$|shrink-0$)/.test(c));
      expect(wrapping(header)).toEqual(wrapping(row));
      expect(wrapping(row)).toContain('flex-wrap');
      [...header.children].forEach((label, i) => expect(placing(label)).toEqual(placing(row.children[i])));
    });

    it('sizes a skill\'s remove button for a finger, and keeps its column as wide on every row', async () => {
      await editorOn('Skills');
      const remove = screen.getByRole('button', { name: 'Remove Language (Latin)' });
      expect(classes(remove)).toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
      const spacer = screen.getByLabelText('Value of Accounting').closest('.group')!.lastElementChild;
      expect(classes(spacer)).toContain('pointer-coarse:w-11');
    });

    it('wraps a list\'s add control', async () => {
      await editorOn('Skills');
      wraps(screen.getByRole('button', { name: 'Add Science' }).parentElement);
    });
  });

  it('sizes a weapon\'s delete button for a finger, and wraps the heading', async () => {
    await editorOn('Combat');
    expect(classes(screen.getByTitle('Delete weapon'))).toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
    wraps(screen.getByRole('heading', { name: 'Weapons' }).parentElement!.parentElement);
  });

  it('puts a contact\'s role under the name and remove button, and beside them from sm up', async () => {
    await editorOn('Possessions');
    const name = screen.getByLabelText('Name of contact 1');
    expect(classes(name)).toContain('min-w-0');
    wraps(name.parentElement);
    expect(classes(screen.getByLabelText('Role of contact 1'))).toEqual(expect.arrayContaining(['order-last', 'w-full', 'sm:order-none', 'sm:w-40']));
    expect(classes(screen.getByRole('button', { name: 'Remove Miss Ada' }))).toEqual(expect.arrayContaining(['touch-target', 'inline-flex']));
    wraps(screen.getByRole('heading', { name: 'Contacts' }).parentElement);
  });
});

describe('the Call of Cthulhu sheet on a phone', () => {
  it('lists the characteristics three to a row', () => {
    render(<CallOfCthulhu7eCharacterView character={sheet()} />);
    characteristicsGrid(above(screen.getByText('STR'), ['grid']));
  });

  it('stacks the wealth\'s three figures, side by side from sm up', async () => {
    render(<CallOfCthulhu7eCharacterView character={sheet()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Possessions' }));
    columns(above(screen.getByText('Spending Level'), ['grid']), 'grid-cols-1', 'sm:grid-cols-3');
  });
});
