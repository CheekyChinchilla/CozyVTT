/**
 * The Horror d100 sheet's body on a phone.
 *
 * On a phone about 300 px is left for a tab's content. The eight
 * characteristics kept four to a row, about 63 px for a block 74 px wide; the
 * current hit points, power points and the box beside them kept three; a
 * skill row's numbers left its name about 90 px; a contact's role box kept
 * 160 px beside the name; and the wealth's three figures kept three columns. Below `sm` each now has a layout of its own; from `sm` up the
 * classes that drew the old one are all still there, behind `sm:` where they
 * changed, and a row that wraps on a phone keeps to one line
 * (`sm:flex-nowrap`). A remove button on a row is 44 px on a touch screen. jsdom
 * evaluates no media query, so the classes are asserted; the screenshots show
 * the layout.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import { blankSkills, horrorD100Character } from './sheetFixture';

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
  horrorD100Character({
    skills: blankSkills({ languageOther: [{ specialty: 'Latin', value: 1, experienceCheck: false }] }),
    weapons: [{ name: 'Fist', skill: 'Brawl', skillValue: 25, damage: '1D3+dm', range: 'Short', attacks: 1 }],
    armor: [{ name: 'Oilskin coat', armorValue: 1 }],
    story: [{ title: 'Background', text: '' }],
    contacts: [{ name: 'Miss Ada', role: 'Librarian', notes: '' }],
  });

async function editorOn(tab?: string) {
  const view = render(<HorrorD100CharacterEditor character={sheet()} onSave={noop} onCancel={vi.fn()} />);
  if (tab) await userEvent.click(screen.getByRole('tab', { name: tab }));
  return view;
}

/** The characteristics: three to a row, four from sm up, eight from md up. */
const characteristicsGrid = (grid: Element) => {
  expect(classes(grid)).toEqual(expect.arrayContaining(['grid-cols-3', 'sm:grid-cols-4', 'md:grid-cols-8']));
  expect(classes(grid)).not.toContain('grid-cols-4');
};

describe('the Horror d100 editor on a phone', () => {
  it('lists the characteristics three to a row', async () => {
    await editorOn();
    characteristicsGrid(above(screen.getByLabelText('STR'), ['grid']));
  });

  it('puts current hit points and power points side by side, and MOV under them', async () => {
    const { container } = await editorOn();
    columns(above(container.querySelector('#horror-d100-current-hp')!, ['grid']), 'grid-cols-2', 'sm:grid-cols-3');
    const move = above(container.querySelector('#horror-d100-move')!, ['bg-paper']);
    expect(classes(move)).toEqual(expect.arrayContaining(['col-span-2', 'sm:col-span-1']));
  });

  it('wraps the Sanity heading and its figures', async () => {
    await editorOn();
    const heading = screen.getByRole('heading', { name: 'Sanity Points' });
    wraps(heading.parentElement!.parentElement);
  });

  describe('Skills', () => {
    it('puts a skill\'s name on a line of its own, its numbers under it, and the one line from sm up', async () => {
      await editorOn('Skills');
      const row = screen.getByLabelText('Value of Appraise').closest('.group')!.firstElementChild!;
      wraps(row);
      expect(classes(row)).toEqual(expect.arrayContaining(['gap-x-2', 'sm:flex-nowrap']));
      const [, name, base] = [...row.children];
      expect(classes(name)).toEqual(expect.arrayContaining(['basis-[calc(100%-1.75rem)]', 'sm:basis-0']));
      expect(classes(base)).toEqual(expect.arrayContaining(['ml-7', 'sm:ml-0']));
    });

    it('lays the header out as the rows are, so its labels stay over their columns on a phone', async () => {
      await editorOn('Skills');
      const header = screen.getByText('Skill Name').parentElement!;
      const row = screen.getByLabelText('Value of Appraise').closest('.group')!.firstElementChild!;
      const wrapping = (element: Element) => classes(element).filter((c) => /^(?:sm:)?(?:flex-wrap|flex-nowrap|gap-)/.test(c));
      const placing = (element: Element) => classes(element).filter((c) => /^(?:[\w-]+:)*(?:w-|min-w-|basis-|ml-|flex-1$|shrink-0$)/.test(c));
      expect(wrapping(header)).toEqual(wrapping(row));
      expect(wrapping(row)).toContain('flex-wrap');
      [...header.children].forEach((label, i) => expect(placing(label)).toEqual(placing(row.children[i])));
    });

    it('sizes a skill\'s notes and remove buttons for a finger, and keeps the remove column as wide on every row', async () => {
      await editorOn('Skills');
      for (const name of ['Remove Language (Latin)', 'Show notes on Language (Latin)', 'Show notes on Appraise']) {
        expect(classes(screen.getByRole('button', { name }))).toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center', 'pointer-coarse:w-11']));
      }
      const spacer = screen.getByLabelText('Value of Appraise').closest('.group')!.firstElementChild!.lastElementChild;
      expect(spacer).toHaveAttribute('aria-hidden', 'true');
      expect(classes(spacer)).toContain('pointer-coarse:w-11');
    });

    it('wraps a category\'s add control', async () => {
      await editorOn('Skills');
      wraps(screen.getByRole('button', { name: 'Add Mental skill' }).parentElement);
    });
  });

  it('sizes a weapon\'s delete button for a finger, and wraps the heading', async () => {
    await editorOn('Combat');
    expect(classes(screen.getByTitle('Delete weapon'))).toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
    wraps(screen.getByRole('heading', { name: 'Weapons' }).parentElement!.parentElement);
  });

  it('puts a piece of armor\'s value under its name and remove button, and beside them from sm up', async () => {
    await editorOn('Combat');
    const name = screen.getByLabelText('Name of armor 1');
    expect(classes(name)).toContain('min-w-0');
    wraps(name.parentElement);
    expect(classes(screen.getByLabelText('Armor value of armor 1').parentElement)).toEqual(expect.arrayContaining(['order-last', 'w-full', 'sm:order-none', 'sm:w-auto']));
    expect(classes(screen.getByRole('button', { name: 'Remove Oilskin coat' }))).toEqual(expect.arrayContaining(['touch-target', 'inline-flex']));
    wraps(screen.getByRole('heading', { name: 'Armor' }).parentElement!.parentElement);
  });

  it('sizes a story note\'s buttons for a finger, and wraps the heading', async () => {
    await editorOn('Story');
    for (const name of ['Move Background up', 'Move Background down', 'Remove Background']) {
      expect(classes(screen.getByRole('button', { name }))).toEqual(expect.arrayContaining(['touch-target', 'inline-flex']));
    }
    expect(classes(screen.getByLabelText('Title of note 1'))).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
    wraps(screen.getByRole('heading', { name: 'Story' }).parentElement!.parentElement);
  });

  // Beside its three buttons, 44 px each on a phone, the title box kept about
  // 150 px and cut a title of twenty letters short.
  it('gives a story note\'s title the whole row, its buttons under it', async () => {
    await editorOn('Story');
    const title = screen.getByLabelText('Title of note 1');
    expect(classes(title)).toEqual(expect.arrayContaining(['basis-full', 'sm:basis-0']));
    expect(classes(title.parentElement)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'justify-end', 'sm:flex-nowrap']));
  });

  // Age is in the header. The Appearance box asked for it a second time.
  it('asks for the age once, and keeps a second box only for a sheet that stores an age under Appearance', async () => {
    const first = await editorOn('Story');
    expect(first.container.querySelector('#horror-d100-appearance-height')).not.toBeNull();
    expect(first.container.querySelector('#horror-d100-appearance-age')).toBeNull();
    first.unmount();

    const stored = render(<HorrorD100CharacterEditor character={horrorD100Character({ appearance: { age: 'about forty' } })} onSave={noop} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Story' }));
    expect(stored.container.querySelector<HTMLInputElement>('#horror-d100-appearance-age')?.value).toBe('about forty');
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

describe('the Horror d100 sheet on a phone', () => {
  it('lists the characteristics three to a row', () => {
    render(<HorrorD100CharacterView character={sheet()} />);
    characteristicsGrid(above(screen.getByText('STR'), ['grid']));
  });

  it('stacks the wealth\'s three figures, side by side from sm up', async () => {
    render(<HorrorD100CharacterView character={sheet()} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Possessions' }));
    columns(above(screen.getByText('Wealth Level'), ['grid']), 'grid-cols-1', 'sm:grid-cols-3');
  });
});
