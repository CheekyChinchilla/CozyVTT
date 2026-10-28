/**
 * Roll mode, in the header of a sheet that rolls at the table: Normal,
 * Advantage or Disadvantage (Fortune and Misfortune in Pathfinder 2e) for
 * every d20 test a click or a tap rolls on that sheet, until changed.
 *
 * Only a right-click opened the menu that rolls with advantage, and Safari on
 * an iPhone or an iPad makes no right-click, so there was no way to it there.
 * A mode set for a run of rolls also suits a lasting advantage with a mouse.
 * It is held while the sheet is open and starts at Normal each time, so a
 * mode left on is not carried into the next evening unnoticed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';
import { dnd5eCharacter } from '../../character-sheets/dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../../character-sheets/pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../../character-sheets/call-of-cthulhu-7e/__tests__/cocFixture';

const rollDice = vi.fn().mockResolvedValue({ ok: true, id: 'r' });
let atTheTable = true;

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => (atTheTable
    ? { socket: { rollDice, emitHitDiceSpend: vi.fn(), on: vi.fn(), off: vi.fn() } }
    : undefined),
}));
vi.mock('@/services/api', () => ({ api: {} }));

const player = { userId: 'owner', campaignId: 'camp-1', role: 'PLAYER', characterIds: [] } as unknown as CampaignMembership;
const mine = (character: Character): Character => ({ ...character, userId: 'owner', campaignId: 'camp-1' }) as Character;

const spear = { name: 'Spear', attackBonus: 4, damageRoll: '1d6+2', damageType: 'piercing', range: 20, properties: [], notes: '' };
const longsword = { name: 'Longsword', type: 'melee', attackBonus: 7, damageRoll: '1d8+4', damageType: 'slashing' };

function open(character: Character) {
  return render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={player} onClose={() => {}} />);
}

const rollMode = () => screen.queryByRole('group', { name: 'Roll mode' });
const choose = (label: string) => fireEvent.click(within(rollMode()!).getByRole('button', { name: label }));
const rolled = () => rollDice.mock.calls.map((call) => {
  const roll = call[0] as { expression: string; purpose: string };
  return [roll.expression, roll.purpose];
});

beforeEach(() => {
  rollDice.mockClear();
  atTheTable = true;
});

describe('Roll mode on a D&D 5e sheet', () => {
  it('starts at Normal, offering Normal, Advantage and Disadvantage', () => {
    open(mine(dnd5eCharacter()));

    const modes = within(rollMode()!).getAllByRole('button');
    expect(modes.map((mode) => mode.textContent)).toEqual(['Normal', 'Advantage', 'Disadvantage']);
    expect(within(rollMode()!).getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('rolls every check, save, skill and attack a click makes with advantage, and the log says so', () => {
    open(mine(dnd5eCharacter({ attacks: [spear] })));

    choose('Advantage');
    fireEvent.click(screen.getByText('dexterity'));
    fireEvent.click(screen.getByText('Stealth'));
    fireEvent.click(screen.getByText('STR'));
    fireEvent.click(screen.getByRole('button', { name: 'Combat' }));
    fireEvent.click(screen.getByText('Spear'));

    expect(rolled()).toEqual([
      ['2d20kh1+0', 'Dexterity Save (Advantage)'],
      ['2d20kh1+0', 'Stealth Check (Advantage)'],
      ['2d20kh1+0', 'Strength Check (Advantage)'],
      ['2d20kh1+4', 'Spear Attack (Advantage)'],
    ]);
  });

  it('stays set for a run of rolls until it is changed', () => {
    open(mine(dnd5eCharacter()));

    choose('Disadvantage');
    fireEvent.click(screen.getByText('dexterity'));
    fireEvent.click(screen.getByText('dexterity'));
    choose('Normal');
    fireEvent.click(screen.getByText('dexterity'));

    expect(rolled()).toEqual([
      ['2d20kl1+0', 'Dexterity Save (Disadvantage)'],
      ['2d20kl1+0', 'Dexterity Save (Disadvantage)'],
      ['1d20+0', 'Dexterity Save'],
    ]);
  });

  it('leaves damage and a hit die as written', () => {
    open(mine(dnd5eCharacter({ attacks: [spear] })));

    choose('Advantage');
    fireEvent.click(screen.getByRole('button', { name: 'Combat' }));
    fireEvent.click(screen.getByTitle('Click to roll damage: 1d6+2'));
    fireEvent.click(screen.getByTitle(/^Spend one hit die/));

    const [damage, hitDie] = rolled();
    expect(damage).toEqual(['1d6+2', 'Spear Damage']);
    expect(hitDie[0]).not.toMatch(/2d20/);
    expect(hitDie[1]).toBe('Spend a Hit Die (Fighter)');
  });

  it('is marked while it is set to anything but Normal', () => {
    open(mine(dnd5eCharacter()));

    const advantage = within(rollMode()!).getByRole('button', { name: 'Advantage' });
    expect(advantage.className).not.toMatch(/\btext-warning-ink\b/);
    choose('Advantage');

    expect(advantage).toHaveAttribute('aria-pressed', 'true');
    expect(advantage.className).toMatch(/\btext-warning-ink\b/);
    expect(within(rollMode()!).getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'false');
  });

  it("gives way to the roll menu's choice, so the menu's Normal rolls one d20", () => {
    open(mine(dnd5eCharacter()));

    choose('Advantage');
    fireEvent.contextMenu(screen.getByText('dexterity'), { clientX: 40, clientY: 40 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Normal' }));

    expect(rolled()).toEqual([['1d20+0', 'Dexterity Save']]);
  });

  it('is Normal again each time a sheet opens', () => {
    const first = open(mine(dnd5eCharacter()));
    choose('Advantage');
    first.unmount();

    open(mine(dnd5eCharacter()));

    expect(within(rollMode()!).getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('where Roll mode sits in the header', () => {
  // jsdom lays nothing out, so the order is read from the document and the
  // placement from the classes. On a phone the control is drawn on a line of
  // its own under the name and the close button; from sm up, in the right
  // column under the close button. Either way it is drawn after the close
  // button, so Tab reaches it after the close button too.
  it('comes after the close button, as it is drawn', () => {
    open(mine(dnd5eCharacter()));

    const close = screen.getByRole('button', { name: 'Close dialog' });
    const group = rollMode()!;
    expect(close.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const header = close.closest('[data-sheet-shell="header"]')!;
    expect(header.className.split(/\s+/)).toEqual(expect.arrayContaining(['grid', 'grid-cols-[minmax(0,1fr)_auto]']));
    expect(group.className.split(/\s+/)).toEqual(expect.arrayContaining(['col-span-2', 'sm:col-span-1', 'sm:col-start-2']));
    // The right column is as wide as Roll mode, so the close button keeps to
    // its end, in the header's corner, and not at its start.
    expect(close.parentElement!.className.split(/\s+/)).toContain('justify-self-end');
  });
});

describe('Roll mode on a Pathfinder 2e sheet', () => {
  it('reads Normal, Fortune and Misfortune, and Fortune rolls a strike twice keeping the higher, its damage once', () => {
    open(mine(pf2eCharacter({ strikes: [longsword] })));

    expect(within(rollMode()!).getAllByRole('button').map((mode) => mode.textContent)).toEqual(['Normal', 'Fortune', 'Misfortune']);
    choose('Fortune');
    fireEvent.click(screen.getByText('Longsword'));
    fireEvent.click(screen.getByTitle('Click to roll damage: 1d8+4'));

    expect(rolled()).toEqual([
      ['2d20kh1+7', 'Longsword Strike (Fortune)'],
      ['1d8+4', 'Longsword Damage'],
    ]);
  });

  it('rolls a save and Perception with Misfortune', () => {
    open(mine(pf2eCharacter()));

    choose('Misfortune');
    fireEvent.click(screen.getByText('will'));
    fireEvent.click(screen.getByText('Perception', { selector: 'div' }));

    expect(rolled().map(([expression, purpose]) => [expression.slice(0, 7), purpose])).toEqual([
      ['2d20kl1', 'Will Save (Misfortune)'],
      ['2d20kl1', 'Perception (Misfortune)'],
    ]);
  });
});

describe('where Roll mode is not offered', () => {
  it('on a Call of Cthulhu sheet, whose rolls stay one d100', () => {
    open(mine(cocCharacter()));

    expect(rollMode()).toBeNull();
    fireEvent.click(screen.getByText('STR'));
    expect(rolled()[0][0]).toBe('1d100');
  });

  it('where the sheet cannot roll: the Characters page has no table', () => {
    atTheTable = false;
    render(<CharacterSheetViewerModal character={dnd5eCharacter()} onClose={() => {}} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(rollMode()).toBeNull();
  });

  it("on another player's character, which a player may read but not roll for", () => {
    open({ ...dnd5eCharacter(), userId: 'someone-else', campaignId: 'camp-1' } as Character);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(rollMode()).toBeNull();
  });
});
