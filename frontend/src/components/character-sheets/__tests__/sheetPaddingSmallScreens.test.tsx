/**
 * The sheets' own padding on a phone.
 *
 * Every sheet padded its header and its body 24 px a side, inside the dialog's
 * own padding, which cost a 360 px phone 48 px of a sheet's width. Below `sm`
 * they pad 12 px; from `sm` up, 24 px as before. The notes an editor shows
 * between its tabs and its body, and its save error under the body, line up
 * with the body at either width.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Character } from '@/types';
import { FifthEditionCharacterView } from '../fifth-edition/FifthEditionCharacterView';
import { FifthEditionCharacterEditor } from '../fifth-edition/FifthEditionCharacterEditor';
import { FantasyD20CharacterView } from '../fantasy-d20/FantasyD20CharacterView';
import { FantasyD20CharacterEditor } from '../fantasy-d20/FantasyD20CharacterEditor';
import { HorrorD100CharacterView } from '../horror-d100/HorrorD100CharacterView';
import { HorrorD100CharacterEditor } from '../horror-d100/HorrorD100CharacterEditor';
import { FlexibleCharacterSheetView } from '../flexible/FlexibleCharacterSheetView';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';
import { fifthEditionCharacter } from '../fifth-edition/__tests__/fifthEditionFixture';
import { fantasyD20Character } from '../fantasy-d20/__tests__/fantasyD20Fixture';
import { horrorD100Character } from '../horror-d100/__tests__/sheetFixture';
import fifthEditionEditorSource from '../fifth-edition/FifthEditionCharacterEditor.tsx?raw';
import fantasyD20EditorSource from '../fantasy-d20/FantasyD20CharacterEditor.tsx?raw';
import horrorD100EditorSource from '../horror-d100/HorrorD100CharacterEditor.tsx?raw';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const noop = () => Promise.resolve();
const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const PHONE_PADDING = ['p-3', 'sm:p-6'];

describe.each([
  ['5E sheet', () => render(<FifthEditionCharacterView character={fifthEditionCharacter()} />)],
  ['5E editor', () => render(<FifthEditionCharacterEditor character={fifthEditionCharacter()} onSave={noop} onCancel={vi.fn()} />)],
  ['Fantasy d20 sheet', () => render(<FantasyD20CharacterView character={fantasyD20Character()} />)],
  ['Fantasy d20 editor', () => render(<FantasyD20CharacterEditor character={fantasyD20Character()} onSave={noop} onCancel={vi.fn()} />)],
  ['Horror d100 sheet', () => render(<HorrorD100CharacterView character={horrorD100Character()} />)],
  ['Horror d100 editor', () => render(<HorrorD100CharacterEditor character={horrorD100Character()} onSave={noop} onCancel={vi.fn()} />)],
])('the %s', (_name, show) => {
  it('pads its header 12 px on a phone and 24 px from sm up', () => {
    const { container } = show();
    const header = container.querySelector('[data-sheet-header]');
    expect(classes(header)).toEqual(expect.arrayContaining(PHONE_PADDING));
    expect(classes(header)).not.toContain('p-6');
  });

  it('pads its body 12 px on a phone and 24 px from sm up', () => {
    const { container } = show();
    const body = container.querySelector('[data-sheet-body]');
    expect(classes(body)).toEqual(expect.arrayContaining(PHONE_PADDING));
    expect(classes(body)).not.toContain('p-6');
  });
});

describe('the flexible sheets', () => {
  const flexible = {
    id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: null, tokenImageUrl: null,
    data: { sections: [] }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Character;

  it.each([
    ['read-only', () => render(<FlexibleCharacterSheetView character={flexible} />)],
    ['editor', () => render(<FlexibleCharacterSheetEdit character={flexible} onSave={noop} onCancel={vi.fn()} />)],
  ])('pad the %s card 12 px on a phone and 24 px from sm up', (_name, show) => {
    const { container } = show();
    expect(classes(container.firstElementChild)).toEqual(expect.arrayContaining(PHONE_PADDING));
    expect(classes(container.firstElementChild)).not.toContain('p-6');
  });
});

// The notes and the save error show only after a refused save or numbers
// brought into range, so their classes are read from the source.
describe.each([
  ['5E', fifthEditionEditorSource],
  ['Fantasy d20', fantasyD20EditorSource],
  ['Horror d100', horrorD100EditorSource],
])('the %s editor', (_name, source) => {
  it('lines its notes and save error up with the body', () => {
    expect(source.match(/className="(?:mx|px)-6 [^"]*"/g) ?? []).toEqual([]);
    expect(source.match(/className="mx-3 sm:mx-6 /g)?.length ?? 0).toBeGreaterThan(0);
    expect(source.match(/className="px-3 sm:px-6 /g)).toHaveLength(1);
  });
});
