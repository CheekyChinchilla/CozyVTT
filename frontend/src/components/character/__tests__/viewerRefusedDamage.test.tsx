/**
 * Damage the dice cannot roll, clicked on a sheet at the table, says why and
 * sends nothing.
 *
 * The D&D 5e and Pathfinder 2e sheets offered any damage text as a roll and
 * sent it, and the server answered "Roll not made: Invalid dice expression:
 * ...", while a Call of Cthulhu weapon's said nothing. Such damage is no
 * longer offered as a roll, and a click on it, the only way to ask on a touch
 * screen, gets the server's answer without anything sent.
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';
import { dnd5eCharacter } from '../../character-sheets/dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../../character-sheets/pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../../character-sheets/call-of-cthulhu-7e/__tests__/cocFixture';

const rollDice = vi.fn().mockResolvedValue({ ok: true, id: 'r' });
const showToast = vi.fn();

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({ socket: { rollDice, emitHitDiceSpend: vi.fn(), on: vi.fn(), off: vi.fn() } }),
}));
vi.mock('@/services/api', () => ({ api: {} }));

const player = { userId: 'owner', campaignId: 'camp-1', role: 'PLAYER', characterIds: [] } as unknown as CampaignMembership;
const mine = (character: Character): Character => ({ ...character, userId: 'owner', campaignId: 'camp-1' }) as Character;

function open(character: Character) {
  render(<CharacterSheetViewerModal character={mine(character)} campaignId="camp-1" membership={player} onClose={() => {}} />);
}

beforeEach(() => {
  rollDice.mockClear();
  showToast.mockReset();
});

it("says why a D&D 5e attack's damage does not roll, and sends nothing", async () => {
  open(dnd5eCharacter({ attacks: [{ name: 'Longsword', attackBonus: 5, damageRoll: '1d8 slashing', damageType: '', range: 5, properties: [], notes: '' }] }));
  fireEvent.click(screen.getByRole('button', { name: 'Combat' }));
  fireEvent.click(screen.getByText('1d8 slashing'));

  await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith(
    'Roll not made: Invalid dice expression: Missing an operator between "1d8" and "slashing"', 'error'
  ));
  expect(rollDice).not.toHaveBeenCalled();
});

it("says why a Pathfinder 2e strike's damage does not roll, and sends nothing", async () => {
  open(pf2eCharacter({ strikes: [{ name: 'Longsword', type: 'melee', attackBonus: 7, damageRoll: '1d8+4 S', damageType: '' }] }));
  fireEvent.click(screen.getByText('1d8+4 S'));

  await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith(
    'Roll not made: Invalid dice expression: Missing an operator between "4" and "s"', 'error'
  ));
  expect(rollDice).not.toHaveBeenCalled();
});

it("says why a Call of Cthulhu weapon's damage does not roll, and sends nothing", async () => {
  open(cocCharacter({ combat: { weapons: [{ name: 'Rock', skill: 'Throw', skillValue: 20, damage: '1d4 thrown', range: 'STR/5 ft', attacks: 1 }] } }));
  fireEvent.click(screen.getByRole('button', { name: 'Combat' }));
  fireEvent.click(screen.getByText('1d4 thrown'));

  await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith(
    'Roll not made: Invalid dice expression: Missing an operator between "1d4" and "thrown"', 'error'
  ));
  expect(rollDice).not.toHaveBeenCalled();
});
