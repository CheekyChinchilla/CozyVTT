/**
 * The Call of Cthulhu editor stops adding to a list where the server stops
 * keeping it.
 *
 * The server refuses a sheet whose weapons, possessions or spells hold more
 * than the list limit, so an add button or a box that went past it made a
 * sheet that could be filled in and not saved. Here the limit is two, so two
 * rows fill a list.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/constants/sheetLimits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/constants/sheetLimits')>()),
  SHEET_LIST_MAX: 2,
}));

const FULL = /This list is full: a sheet holds at most 2 entries here/;

function open(tab: string, overrides: Record<string, unknown>) {
  render(<CallOfCthulhu7eCharacterEditor character={cocCharacter(overrides)} onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: tab }));
}

const weapon = (name: string) => ({ name, skill: 'Fighting (Brawl)', skillValue: 25, damage: '1d3', range: 'Touch', attacks: 1, ammo: null, malfunction: null, notes: '' });
const combat = (weapons: unknown[]) => ({ ...(COC_BLANK_SHEET.combat as object), weapons });
const mythos = (spells: string[]) => ({ ...(COC_BLANK_SHEET.spellsAndMythos as object), cthulhuMythos: 0, spells });

describe('the weapons list', () => {
  it('turns Add Weapon off at the limit, and says why', () => {
    open('Combat', { combat: combat([weapon('Knife'), weapon('Club')]) });
    expect(screen.getByRole('button', { name: 'Add Weapon' })).toBeDisabled();
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it('keeps Add Weapon on while there is room', () => {
    open('Combat', { combat: combat([weapon('Knife')]) });
    expect(screen.getByRole('button', { name: 'Add Weapon' })).toBeEnabled();
    expect(screen.queryByText(FULL)).toBeNull();
  });
});

describe('the possessions box', () => {
  const box = () => screen.getByPlaceholderText(/List possessions/) as HTMLTextAreaElement;

  it('does not take a third possession, and says why', () => {
    open('Possessions', { possessions: [{ name: 'Knife', notes: '' }, { name: 'Rope', notes: '' }] });
    fireEvent.change(box(), { target: { value: 'Knife\nRope\nLantern' } });

    expect(box().value).toBe('Knife\nRope');
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it('takes a possession while there is room', () => {
    open('Possessions', { possessions: [{ name: 'Knife', notes: '' }] });
    fireEvent.change(box(), { target: { value: 'Knife\nRope' } });

    expect(box().value).toBe('Knife\nRope');
  });
});

describe('the spells box', () => {
  const box = () => screen.getByPlaceholderText(/Contact Nyarlathotep/) as HTMLTextAreaElement;

  it('does not take a third spell, and says why', () => {
    open('Backstory', { spellsAndMythos: mythos(['Elder Sign', 'Voorish Sign']) });
    fireEvent.change(box(), { target: { value: 'Elder Sign\nVoorish Sign\nBanish' } });

    expect(box().value).toBe('Elder Sign\nVoorish Sign');
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });
});
