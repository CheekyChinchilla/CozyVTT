/**
 * The sheets' headers on a phone.
 *
 * Each header was laid out for a desk at every width. The read-only sheets
 * kept their Edit button in the top right corner over a row padded to clear
 * it, and kept the experience, hero points or player block beside the name;
 * the editors kept a 160 px portrait beside the name with its caption hung
 * under it out of the flow, so on a phone the name had about 30 px. Below
 * `sm` the Edit button now sits in the flow above the name, the right-hand
 * block goes under it, the editors' portrait is 96 px above the name with its
 * caption under it, and lines of details wrap. From `sm` up the classes that
 * drew the old layout are all still there, behind `sm:`. jsdom evaluates no
 * media query, so the classes are asserted; the matrix shows the layout.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Character } from '@/types';
import { DnD5eCharacterView } from '../dnd5e/DnD5eCharacterView';
import { DnD5eCharacterEditor } from '../dnd5e/DnD5eCharacterEditor';
import { Pathfinder2eCharacterView } from '../pathfinder2e/Pathfinder2eCharacterView';
import { Pathfinder2eCharacterEditor } from '../pathfinder2e/Pathfinder2eCharacterEditor';
import { CallOfCthulhu7eCharacterView } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterView';
import { CallOfCthulhu7eCharacterEditor } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';
import { FlexibleCharacterSheetView } from '../flexible/FlexibleCharacterSheetView';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const noop = () => Promise.resolve();
const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

/** The nearest element holding both. */
function around(a: Element, b: Element): Element {
  let at: Element | null = a;
  while (at && !at.contains(b)) at = at.parentElement;
  if (!at) throw new Error('no element holds both');
  return at;
}

/** A row that stacks below sm and is the old row from sm up. */
const stacksOnAPhone = (row: Element) => {
  expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'sm:flex-row']));
};

describe.each([
  ['D&D 5e', () => render(<DnD5eCharacterView character={dnd5eCharacter()} onEdit={vi.fn()} />), 'Experience'],
  ['Pathfinder 2e', () => render(<Pathfinder2eCharacterView character={pf2eCharacter()} onEdit={vi.fn()} />), 'Experience Points'],
  ['Call of Cthulhu', () => render(<CallOfCthulhu7eCharacterView character={cocCharacter({ playerName: 'Mara' })} onEdit={vi.fn()} />), 'Player'],
])('the %s read-only header', (_system, show, aside) => {
  it('puts Edit in the flow on a phone and in the corner from sm up', () => {
    show();
    const edit = classes(screen.getByRole('button', { name: /Edit/ }));
    expect(edit).not.toContain('absolute');
    expect(edit).toEqual(expect.arrayContaining(['sm:absolute', 'sm:top-4', 'sm:right-4', 'ml-auto', 'w-fit']));
  });

  it('puts the block beside the name under it on a phone, clear of Edit from sm up', () => {
    show();
    const row = around(screen.getByRole('heading', { level: 2 }), screen.getByText(aside));
    stacksOnAPhone(row);
    expect(classes(row)).toContain('sm:pr-24');
    expect(classes(row)).not.toContain('pr-24');
  });
});

describe('the read-only headers\' lines of details', () => {
  it('wrap on the D&D 5e sheet', () => {
    render(<DnD5eCharacterView character={dnd5eCharacter({ alignment: 'Lawful Good', background: 'Sage' })} />);
    expect(classes(screen.getByText('• Sage').parentElement)).toContain('flex-wrap');
  });

  it('wrap on the Call of Cthulhu sheet', () => {
    render(<CallOfCthulhu7eCharacterView character={cocCharacter({ occupation: 'Antiquarian', era: '1920s', age: 41, sex: 'F', birthplace: 'Arkham' })} />);
    expect(classes(screen.getByText('• 1920s').parentElement)).toContain('flex-wrap');
    expect(classes(screen.getByText('• Born in Arkham').parentElement)).toContain('flex-wrap');
  });
});

describe.each([
  ['D&D 5e', () => render(<DnD5eCharacterEditor character={dnd5eCharacter()} onSave={noop} onCancel={vi.fn()} />), 'Character name', 'Experience Points', true],
  ['Pathfinder 2e', () => render(<Pathfinder2eCharacterEditor character={pf2eCharacter()} onSave={noop} onCancel={vi.fn()} />), 'Character name', 'Experience Points', true],
  ['Call of Cthulhu', () => render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={noop} onCancel={vi.fn()} />), 'Investigator name', null, false],
] as const)('the %s editor header', (_system, show, name, aside, bigPortrait) => {
  const picture = (container: HTMLElement) => {
    const input = container.querySelector('input[type="file"]');
    if (!input?.parentElement) throw new Error('no token picture');
    return input.parentElement;
  };

  it('puts the portrait above the name on a phone and beside it from sm up', () => {
    const { container } = show();
    stacksOnAPhone(around(picture(container), screen.getByLabelText(name)));
  });

  if (aside) {
    it('puts the experience under the name on a phone', () => {
      show();
      stacksOnAPhone(around(screen.getByLabelText(name), screen.getByText(aside)));
    });
  }

  if (bigPortrait) {
    it('draws the portrait at 96 px on a phone and 160 px from sm up', () => {
      const { container } = show();
      const holder = picture(container);
      expect(classes(holder)).toEqual(expect.arrayContaining(['w-24', 'sm:w-40']));
      const circle = holder.querySelector('label > :first-child');
      expect(classes(circle)).toEqual(expect.arrayContaining(['w-24', 'h-24', 'sm:w-40', 'sm:h-40']));
    });
  }

  it('puts the caption under the portrait in the flow on a phone', () => {
    show();
    const caption = classes(screen.getByText('Saves as personal token'));
    expect(caption).not.toContain('absolute');
    expect(caption).not.toContain('whitespace-nowrap');
    expect(caption).toEqual(expect.arrayContaining(['sm:absolute', 'sm:top-full', 'sm:whitespace-nowrap']));
  });
});

describe('the Call of Cthulhu editor header', () => {
  it('stacks its boxes on a phone', () => {
    render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={noop} onCancel={vi.fn()} />);
    expect(classes(screen.getByLabelText('Occupation').parentElement)).toEqual(expect.arrayContaining(['grid-cols-1', 'sm:grid-cols-3']));
    expect(classes(screen.getByLabelText('Age').parentElement)).toEqual(expect.arrayContaining(['grid-cols-2', 'sm:grid-cols-4']));
  });
});

describe('the flexible read-only header', () => {
  it('puts Edit under the name where it does not fit beside it', () => {
    const flexible = {
      id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: null, tokenImageUrl: null,
      data: { sections: [] }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as Character;
    render(<FlexibleCharacterSheetView character={flexible} onEdit={vi.fn()} />);
    const row = around(screen.getByRole('heading', { name: 'Freeform' }), screen.getByRole('button', { name: /^Edit$/ }));
    expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap']));
  });
});

describe('the flexible editor header', () => {
  const flexible = {
    id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: null, tokenImageUrl: null,
    data: { sections: [] }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Character;

  it('puts Save and Cancel under the name where they do not fit beside it', () => {
    render(<FlexibleCharacterSheetEdit character={flexible} onSave={noop} onCancel={vi.fn()} />);
    const row = around(screen.getByRole('heading', { name: /Editing:/ }), screen.getByRole('button', { name: 'Cancel' }));
    expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap']));
  });

  it('puts the caption under the portrait in the flow on a phone', () => {
    render(<FlexibleCharacterSheetEdit character={flexible} onSave={noop} onCancel={vi.fn()} />);
    const caption = classes(screen.getByText('Saves as personal token'));
    expect(caption).not.toContain('absolute');
    expect(caption).toEqual(expect.arrayContaining(['sm:absolute', 'sm:top-full', 'sm:whitespace-nowrap']));
  });
});
