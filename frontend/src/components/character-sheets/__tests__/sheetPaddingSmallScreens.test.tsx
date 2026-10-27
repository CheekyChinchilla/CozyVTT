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
import { DnD5eCharacterView } from '../dnd5e/DnD5eCharacterView';
import { DnD5eCharacterEditor } from '../dnd5e/DnD5eCharacterEditor';
import { Pathfinder2eCharacterView } from '../pathfinder2e/Pathfinder2eCharacterView';
import { Pathfinder2eCharacterEditor } from '../pathfinder2e/Pathfinder2eCharacterEditor';
import { CallOfCthulhu7eCharacterView } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterView';
import { CallOfCthulhu7eCharacterEditor } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor';
import { FlexibleCharacterSheetView } from '../flexible/FlexibleCharacterSheetView';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';
import dnd5eEditorSource from '../dnd5e/DnD5eCharacterEditor.tsx?raw';
import pf2eEditorSource from '../pathfinder2e/Pathfinder2eCharacterEditor.tsx?raw';
import cocEditorSource from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor.tsx?raw';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const noop = () => Promise.resolve();
const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const PHONE_PADDING = ['p-3', 'sm:p-6'];

describe.each([
  ['D&D 5e sheet', () => render(<DnD5eCharacterView character={dnd5eCharacter()} />)],
  ['D&D 5e editor', () => render(<DnD5eCharacterEditor character={dnd5eCharacter()} onSave={noop} onCancel={vi.fn()} />)],
  ['Pathfinder 2e sheet', () => render(<Pathfinder2eCharacterView character={pf2eCharacter()} />)],
  ['Pathfinder 2e editor', () => render(<Pathfinder2eCharacterEditor character={pf2eCharacter()} onSave={noop} onCancel={vi.fn()} />)],
  ['Call of Cthulhu sheet', () => render(<CallOfCthulhu7eCharacterView character={cocCharacter()} />)],
  ['Call of Cthulhu editor', () => render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={noop} onCancel={vi.fn()} />)],
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
  ['D&D 5e', dnd5eEditorSource],
  ['Pathfinder 2e', pf2eEditorSource],
  ['Call of Cthulhu', cocEditorSource],
])('the %s editor', (_name, source) => {
  it('lines its notes and save error up with the body', () => {
    expect(source.match(/className="(?:mx|px)-6 [^"]*"/g) ?? []).toEqual([]);
    expect(source.match(/className="mx-3 sm:mx-6 /g)?.length ?? 0).toBeGreaterThan(0);
    expect(source.match(/className="px-3 sm:px-6 /g)).toHaveLength(1);
  });
});
