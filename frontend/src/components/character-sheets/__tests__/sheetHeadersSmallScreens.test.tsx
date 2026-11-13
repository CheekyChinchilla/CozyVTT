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
 * drew the old layout are all still there, behind `sm:`, except the
 * caption's: it stays in the flow under the portrait at every width. jsdom
 * evaluates no media query, so the classes are asserted; the matrix shows the
 * layout.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Character } from '@/types';
import { FifthEditionCharacterView } from '../fifth-edition/FifthEditionCharacterView';
import { FifthEditionCharacterEditor } from '../fifth-edition/FifthEditionCharacterEditor';
import { FantasyD20CharacterView } from '../fantasy-d20/FantasyD20CharacterView';
import { FantasyD20CharacterEditor } from '../fantasy-d20/FantasyD20CharacterEditor';
import { HorrorD100CharacterView } from '../horror-d100/HorrorD100CharacterView';
import { HorrorD100CharacterEditor } from '../horror-d100/HorrorD100CharacterEditor';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';
import { FlexibleCharacterSheetView } from '../flexible/FlexibleCharacterSheetView';
import { fifthEditionCharacter } from '../fifth-edition/__tests__/fifthEditionFixture';
import { fantasyD20Character } from '../fantasy-d20/__tests__/fantasyD20Fixture';
import { horrorD100Character } from '../horror-d100/__tests__/sheetFixture';

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
  ['5E', () => render(<FifthEditionCharacterView character={fifthEditionCharacter()} onEdit={vi.fn()} />), 'Experience'],
  ['Fantasy d20', () => render(<FantasyD20CharacterView character={fantasyD20Character()} onEdit={vi.fn()} />), 'Experience Points'],
  ['Horror d100', () => render(<HorrorD100CharacterView character={horrorD100Character({ playerName: 'Mara' })} onEdit={vi.fn()} />), 'Player'],
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
  it('wrap on the 5E sheet', () => {
    render(<FifthEditionCharacterView character={fifthEditionCharacter({ alignment: 'Lawful Good', background: 'Acolyte' })} />);
    expect(classes(screen.getByText('• Acolyte').parentElement)).toContain('flex-wrap');
  });

  it('wrap on the Horror d100 sheet', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ profession: 'Archivist', era: '1920s', age: 41, sex: 'F', birthplace: 'Fallowmere' })} />);
    expect(classes(screen.getByText('• 1920s').parentElement)).toContain('flex-wrap');
    expect(classes(screen.getByText('• Born in Fallowmere').parentElement)).toContain('flex-wrap');
  });
});

describe.each([
  ['5E', () => render(<FifthEditionCharacterEditor character={fifthEditionCharacter()} onSave={noop} onCancel={vi.fn()} />), 'Character name', 'Experience Points', true],
  ['Fantasy d20', () => render(<FantasyD20CharacterEditor character={fantasyD20Character()} onSave={noop} onCancel={vi.fn()} />), 'Character name', 'Experience Points', true],
  ['Horror d100', () => render(<HorrorD100CharacterEditor character={horrorD100Character()} onSave={noop} onCancel={vi.fn()} />), 'Character name', null, false],
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

});

describe('the Horror d100 editor header', () => {
  it('stacks its boxes on a phone', () => {
    render(<HorrorD100CharacterEditor character={horrorD100Character()} onSave={noop} onCancel={vi.fn()} />);
    expect(classes(screen.getByLabelText('Profession').parentElement)).toEqual(expect.arrayContaining(['grid-cols-1', 'sm:grid-cols-3']));
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

/** A flexible character in no campaign, for its editor. */
const freeform = {
  id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: null, tokenImageUrl: null,
  data: { sections: [] }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Character;

describe('the flexible editor header', () => {
  it('puts Save and Cancel under the name where they do not fit beside it', () => {
    render(<FlexibleCharacterSheetEdit character={freeform} onSave={noop} onCancel={vi.fn()} />);
    const row = around(screen.getByRole('heading', { name: /Editing:/ }), screen.getByRole('button', { name: 'Cancel' }));
    expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap']));
  });
});

/** The utility applies at some width: bare, or behind any breakpoint. */
const atSomeWidth = (list: string[], utility: string) => list.some((c) => c === utility || c.endsWith(`:${utility}`));
/** The width classes, bare and behind a breakpoint, such as `w-24 sm:w-40`. */
const widths = (element: Element | null) => classes(element).filter((c) => /^(?:[a-z0-9-]+:)?w-/.test(c)).sort();

describe.each([
  ['5E', () => render(<FifthEditionCharacterEditor character={fifthEditionCharacter()} onSave={noop} onCancel={vi.fn()} />)],
  ['Fantasy d20', () => render(<FantasyD20CharacterEditor character={fantasyD20Character()} onSave={noop} onCancel={vi.fn()} />)],
  ['Horror d100', () => render(<HorrorD100CharacterEditor character={horrorD100Character()} onSave={noop} onCancel={vi.fn()} />)],
  ['Flexible', () => render(<FlexibleCharacterSheetEdit character={freeform} onSave={noop} onCancel={vi.fn()} />)],
] as const)('the %s editor\'s portrait caption', (_system, show) => {
  // From sm up the caption was hung under the portrait out of the flow, on
  // one line, and ran into the field beside it. jsdom lays nothing out, so
  // the classes that decide its width are asserted; the browser shows it.
  it('stays in the portrait\'s column at every width, as wide as the portrait, and wraps', () => {
    show();
    // The box holding the notes under the portrait (PortraitNotes).
    const box = screen.getByText('Saves as personal token').parentElement;
    const column = box?.parentElement ?? null;
    if (!column) throw new Error('no portrait column');
    expect(column.querySelector('input[type="file"]')).not.toBeNull();
    const circle = column.querySelector('label > :first-child');
    expect(widths(column).length).toBeGreaterThan(0);
    expect(widths(column)).toEqual(widths(circle));
    for (const list of [classes(box), classes(column)]) {
      for (const utility of ['absolute', 'fixed', 'whitespace-nowrap', 'w-max', 'w-fit']) {
        expect(atSomeWidth(list, utility), `${utility} in "${list.join(' ')}"`).toBe(false);
      }
    }
  });
});
