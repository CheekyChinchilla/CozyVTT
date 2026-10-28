/**
 * The D&D 5e sheet's body on a phone.
 *
 * On a phone about 300 px is left for a tab's content, and the body was laid
 * out for a desk: two columns of saving throws, three of spell slots and
 * conditions, five coins in a row, a hit dice row of about 280 px of fixed
 * columns, rows of boxes that never wrapped, and text boxes that kept their
 * full width in a row. Below `sm` each now has a layout of its own; from `sm`
 * up the classes that drew the old one are all still there, behind `sm:` where
 * they changed, and a row that wraps on a phone keeps to one line from `sm` up
 * (`sm:flex-nowrap`). A delete button on a row, and the chip that removes a
 * weapon property, are 44 px on a touch screen, as the rest of the app's are. jsdom evaluates no media query, so the classes are
 * asserted; the screenshots show the layout.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { DnD5eCharacterView } from '../DnD5eCharacterView';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const noop = () => Promise.resolve();
const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

/** The nearest element above `from` whose classes include all of `want`. */
function above(from: Element, want: string[]): Element {
  let at = from.parentElement;
  while (at && !want.every((c) => classes(at).includes(c))) at = at.parentElement;
  if (!at) throw new Error(`nothing above with ${want.join(' ')}`);
  return at;
}

const SPELLCASTING = {
  class: 'Wizard',
  ability: 'Intelligence',
  cantrips: ['Light'],
  slots: { 1: { total: 2, expended: 0 } },
  spells: [{ level: 1, name: 'Shield', prepared: true, ritual: false, concentration: false }],
};

const sheet = () =>
  dnd5eCharacter({
    attacks: [
      {
        name: 'Spear',
        attackBonus: 4,
        damageRoll: '1d6+2',
        damageType: 'piercing',
        range: 20,
        properties: ['Homebrew'],
        notes: '',
        additionalDamage: [{ label: 'Two-handed', damageRoll: '1d8+2', damageType: 'piercing' }],
      },
    ],
    spellcasting: SPELLCASTING,
    featuresAndTraits: [{ name: 'Second Wind', description: '' }],
    customSkills: [{ name: "Thieves' Tools", ability: 'dexterity', proficient: true, expertise: false }],
  });

async function editorOn(tab?: string) {
  const view = render(<DnD5eCharacterEditor character={sheet()} onSave={noop} onCancel={vi.fn()} />);
  if (tab) await userEvent.click(screen.getByRole('button', { name: tab }));
  return view;
}

async function viewOn(tab?: string) {
  const view = render(<DnD5eCharacterView character={sheet()} />);
  if (tab) await userEvent.click(screen.getByRole('button', { name: tab }));
  return view;
}

/** A grid that has `phone` columns below sm and `desk` from sm up. */
const columns = (grid: Element, phone: string, desk: string) => {
  expect(classes(grid)).toEqual(expect.arrayContaining(['grid', phone, desk]));
  expect(classes(grid)).not.toContain(desk.replace(/^sm:/, ''));
};

describe('the D&D 5e editor on a phone', () => {
  describe('Stats & Skills', () => {
    it('lists the saving throws in one column, and two from sm up', async () => {
      const { container } = await editorOn();
      columns(above(container.querySelector('#save-strength')!, ['grid']), 'grid-cols-1', 'sm:grid-cols-2');
    });

    it('lets a skill\'s ability go under its name where the row is narrow', async () => {
      const { container } = await editorOn();
      const label = container.querySelector('label[for="skill-prof-intimidation"]')!;
      const abbreviation = label.querySelector('span')!;
      expect(abbreviation.previousSibling?.nodeName).toBe('WBR');
    });

    it('wraps Your Own Skills\' Add button under the heading where they do not fit', async () => {
      await editorOn();
      expect(classes(screen.getByRole('heading', { name: 'Your Own Skills' }).parentElement)).toEqual(
        expect.arrayContaining(['flex', 'flex-wrap', 'gap-2', 'sm:flex-nowrap'])
      );
    });
  });

  describe('Combat', () => {
    it('gives the initiative bonus the whole width, and a third of it from sm up', async () => {
      const { container } = await editorOn('Combat');
      columns(above(container.querySelector('#initiative-other-bonus')!, ['grid']), 'grid-cols-1', 'sm:grid-cols-3');
    });

    it('puts a hit dice row\'s class on a line of its own, and keeps the one-line row from sm up', async () => {
      await editorOn('Combat');
      const name = screen.getByLabelText('Class of hit dice 1');
      const row = name.parentElement!;
      const desk = 'sm:grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_0.75rem_3.5rem_1.75rem]';
      expect(classes(row)).toContain(desk);
      expect(classes(row)).not.toContain(desk.replace(/^sm:/, ''));
      expect(classes(name)).toEqual(expect.arrayContaining(['col-span-5', 'sm:col-span-1']));
      // The labels above the rows line up with them at every width.
      const header = screen.getByText('Max', { selector: 'span' }).parentElement!;
      const tracks = (element: Element) => classes(element).filter((c) => c.includes('grid-cols-'));
      expect(tracks(header)).toEqual(tracks(row));
      expect(tracks(row)).toHaveLength(3);
      expect(classes(screen.getByText('Class', { selector: 'span' }))).toEqual(expect.arrayContaining(['col-span-5', 'sm:col-span-1']));
    });

    it('lists the conditions in two columns, and three from sm up', async () => {
      await editorOn('Combat');
      columns(above(screen.getByLabelText('Blinded'), ['grid']), 'grid-cols-2', 'sm:grid-cols-3');
    });

    it('wraps Hit Dice\'s and Attacks & Spellcasting\'s Add buttons under their headings', async () => {
      await editorOn('Combat');
      for (const name of ['Hit Dice', 'Attacks & Spellcasting']) {
        expect(classes(screen.getByRole('heading', { name }).parentElement)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-2', 'sm:flex-nowrap']));
      }
      expect(classes(screen.getByText('Other Damage Rolls').parentElement)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-2', 'sm:flex-nowrap']));
    });

    it('sizes the chip that removes a weapon property of your own for a finger', async () => {
      await editorOn('Combat');
      expect(classes(screen.getByTitle('Remove "Homebrew"'))).toEqual(
        expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center'])
      );
    });

    it('lets an attack\'s name box shrink beside its delete button', async () => {
      await editorOn('Combat');
      expect(classes(screen.getByLabelText('Name of attack 1'))).toContain('min-w-0');
      expect(classes(screen.getByLabelText('Add a custom weapon property'))).toContain('min-w-0');
    });

    it('puts an extra damage roll\'s "when" on a line of its own, and the row on one line from sm up', async () => {
      await editorOn('Combat');
      const when = screen.getByLabelText('When damage roll 1 applies');
      expect(classes(when.parentElement)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'sm:flex-nowrap']));
      expect(classes(when)).toEqual(expect.arrayContaining(['min-w-0', 'basis-full', 'sm:basis-0', 'flex-1']));
      for (const box of [screen.getByLabelText('Damage roll 1'), screen.getByLabelText('Damage type of roll 1')]) {
        expect(classes(box)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1', 'sm:flex-initial', 'w-28']));
      }
    });
  });

  describe('Spells', () => {
    it('stacks the spellcasting class and ability, side by side from sm up', async () => {
      await editorOn('Spells');
      columns(above(screen.getByLabelText('Spellcasting Class'), ['grid']), 'grid-cols-1', 'sm:grid-cols-2');
    });

    it('lists the spell slots in two columns, and three from sm up', async () => {
      const { container } = await editorOn('Spells');
      const card = above(container.querySelector('#spell-slots-1-total')!, ['bg-paper']);
      columns(card.parentElement!, 'grid-cols-2', 'sm:grid-cols-3');
    });

    it('puts a spell\'s level and name on the first line and its boxes under them', async () => {
      await editorOn('Spells');
      const name = screen.getByLabelText('Name of spell 1');
      expect(classes(name)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1', 'basis-[calc(100%-4.25rem)]', 'sm:basis-0']));
      expect(classes(name.parentElement)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-3', 'sm:flex-nowrap']));
      expect(classes(name.parentElement)).not.toContain('space-x-3');
    });

    it('wraps the spell list\'s Add button under its heading', async () => {
      await editorOn('Spells');
      expect(classes(screen.getByRole('heading', { name: 'Spells' }).parentElement)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-2', 'sm:flex-nowrap']));
    });
  });

  describe('Inventory', () => {
    it('lists the coins three to a row, and five from sm up', async () => {
      const { container } = await editorOn('Inventory');
      columns(above(container.querySelector('#currency-cp')!, ['grid']), 'grid-cols-3', 'sm:grid-cols-5');
    });

    it('lets an item\'s name box shrink, and wraps its tick boxes', async () => {
      await editorOn('Inventory');
      expect(classes(screen.getByLabelText('Name of item 1'))).toContain('min-w-0');
      const ticks = screen.getByText('Requires Attunement').closest('label')!.parentElement;
      expect(classes(ticks)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-x-4', 'sm:flex-nowrap']));
      expect(classes(ticks)).not.toContain('space-x-4');
      expect(classes(screen.getByRole('heading', { name: 'Inventory' }).parentElement)).toEqual(expect.arrayContaining(['flex-wrap', 'gap-2', 'sm:flex-nowrap']));
    });
  });

  describe('Features', () => {
    it('lets a feature\'s name box shrink, and wraps the Add button under the heading', async () => {
      await editorOn('Features');
      expect(classes(screen.getByLabelText('Feature 1 name'))).toContain('min-w-0');
      expect(classes(screen.getByRole('heading', { name: 'Features & Traits' }).parentElement)).toEqual(expect.arrayContaining(['flex-wrap', 'gap-2', 'sm:flex-nowrap']));
    });
  });

  it.each(['Stats & Skills', 'Combat', 'Spells', 'Inventory', 'Features'])('sizes the delete buttons for a finger on %s', async (tab) => {
    await editorOn(tab === 'Stats & Skills' ? undefined : tab);
    const deletes = screen.getAllByRole('button').filter((button) => button.textContent?.trim() === '×');
    expect(deletes.length).toBeGreaterThan(0);
    for (const button of deletes) expect(classes(button)).toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
  });
});

describe('the D&D 5e sheet on a phone', () => {
  it('lists the saving throws in one column, two from sm up and three from md up', async () => {
    await viewOn();
    const grid = above(screen.getByText('strength'), ['grid']);
    expect(classes(grid)).toEqual(expect.arrayContaining(['grid-cols-1', 'sm:grid-cols-2', 'md:grid-cols-3']));
    expect(classes(grid)).not.toContain('grid-cols-2');
  });

  it('stacks the spellcasting ability, save DC and attack, side by side from sm up', async () => {
    await viewOn('Spells');
    columns(above(screen.getByText('Spellcasting Ability'), ['grid']), 'grid-cols-1', 'sm:grid-cols-3');
  });

  it('wraps a level\'s slot marks', async () => {
    const { container } = await viewOn('Spells');
    const marks = container.querySelector('[data-slot]')!.parentElement;
    expect(classes(marks)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-1']));
    expect(classes(marks)).not.toContain('space-x-1');
    // At every width: up to 20 marks ran out of their column on a desktop too.
    expect(classes(marks)).not.toContain('sm:flex-nowrap');
  });

  it('lists the coins three to a row, five from sm up, and wraps the total weight under the heading', async () => {
    await viewOn('Inventory');
    columns(above(screen.getByText('PP'), ['grid']), 'grid-cols-3', 'sm:grid-cols-5');
    expect(classes(screen.getByRole('heading', { name: 'Equipment & Items' }).parentElement)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'sm:flex-nowrap']));
  });
});
