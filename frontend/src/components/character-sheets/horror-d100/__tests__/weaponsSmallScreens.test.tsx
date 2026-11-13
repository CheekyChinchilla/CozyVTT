/**
 * The Horror d100 weapons on a phone.
 *
 * The weapons were a table of eight or nine columns, about 710 px wide, in a
 * scroller about 330 px wide: in the editor a weapon's name box came out
 * 38 px wide and its skill box 10 px, and on the read-only sheet half the
 * columns were off screen with nothing to say so. Below `sm` each weapon is
 * now a card: its name across the top, then its figures two to a row, each
 * under its column's name, with the notes beneath. From `sm` up it is the
 * table it was. The malfunction box takes three digits.
 *
 * jsdom evaluates no media query, so the classes are asserted; the
 * screenshots show the layout.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeaponsList } from '../components/WeaponsList';

const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

const weapons = [
  { name: 'Service revolver', skill: 'Firearm (Revolver)', skillValue: 40, damage: '1D8', range: '25 meters', attacks: 1, ammo: 6, malfunction: 100, notes: 'Six rounds' },
  { name: 'Boathook', skill: 'Melee Weapon (Spear)', skillValue: 15, damage: '1D8+dm', range: 'Long', attacks: 1, ammo: null, malfunction: null, notes: '' },
];

const COLUMNS = ['Weapon', 'Skill', 'Value', 'Damage', 'Range', 'Atks', 'Ammo', 'Malf'];

function drawn(editable: boolean) {
  const { container } = render(<WeaponsList weapons={weapons} editable={editable} onChange={vi.fn()} />);
  const table = container.querySelector('table');
  if (!table) throw new Error('no weapons table');
  return { container, table };
}

describe.each([['the editor', true], ['the read-only sheet', false]])('the Horror d100 weapons in %s on a phone', (_where, editable) => {
  it('are a table from sm up only, its heading row hidden below', () => {
    const { table } = drawn(editable);
    expect(classes(table)).toEqual(expect.arrayContaining(['block', 'sm:table']));
    expect(classes(table.querySelector('thead'))).toEqual(expect.arrayContaining(['hidden', 'sm:table-header-group']));
  });

  it('are a card each: the weapon\'s rows in a block of their own, its figures two to a row', () => {
    const { table } = drawn(editable);
    const cards = Array.from(table.querySelectorAll('tbody'));
    expect(cards).toHaveLength(weapons.length);
    for (const card of cards) {
      expect(classes(card)).toEqual(expect.arrayContaining(['block', 'sm:table-row-group', 'border', 'sm:border-0']));
      const figures = card.querySelector('tr');
      expect(classes(figures)).toEqual(expect.arrayContaining(['grid', 'grid-cols-2', 'sm:table-row']));
      for (const cell of Array.from(card.querySelectorAll('td'))) expect(classes(cell)).toEqual(expect.arrayContaining(['block', 'sm:table-cell']));
      expect(classes(figures?.querySelector('td') ?? null)).toContain('col-span-2');
    }
  });

  it('name each figure on its card, since the heading row is hidden there', () => {
    const { table } = drawn(editable);
    const first = table.querySelector('tbody tr');
    const labelled = Array.from(first?.querySelectorAll('td[data-label]') ?? []);
    expect(labelled.map((cell) => cell.getAttribute('data-label'))).toEqual(COLUMNS);
    for (const cell of labelled) {
      expect(classes(cell)).toEqual(expect.arrayContaining(['before:content-[attr(data-label)]', 'sm:before:hidden']));
    }
  });

  it('keep the table\'s rows and what each says', () => {
    drawn(editable);
    // The heading row, and for each weapon its figures and its notes where it has a row for them.
    expect(screen.getAllByRole('row')).toHaveLength(editable ? 1 + 2 + 2 : 1 + 2 + 1);
    if (!editable) expect(screen.getByText('Boathook').closest('tr')).toHaveTextContent('BoathookMelee Weapon (Spear)15%1D8+dmLong1——');
  });
});

describe('the Horror d100 weapon boxes in the editor', () => {
  it('fill the card\'s column on a phone, and keep their widths from sm up', () => {
    drawn(true);
    for (const [label, width] of [['Damage of weapon 1', 'sm:w-20'], ['Range of weapon 1', 'sm:w-20'], ['Skill value of weapon 1', 'sm:w-16'], ['Attacks of weapon 1', 'sm:w-12']] as const) {
      expect(classes(screen.getByLabelText(label))).toEqual(expect.arrayContaining(['w-full', width]));
    }
  });

  it('show a malfunction number of three digits whole', () => {
    drawn(true);
    const box = screen.getByLabelText('Malfunction of weapon 1');
    expect(box).toHaveValue(100);
    expect(classes(box)).toEqual(expect.arrayContaining(['w-full', 'sm:w-16']));
    expect(classes(box)).not.toContain('w-12');
    expect(classes(box)).not.toContain('sm:w-12');
  });

  it('give the delete button a finger\'s width', () => {
    drawn(true);
    expect(classes(screen.getByRole('button', { name: 'Delete Boathook' }))).toContain('touch-target');
  });
});
