/**
 * A sheet opened from a token on a map the table is not on rolls for the DM
 * alone: the dice log would otherwise tell the players of a map being
 * prepared, under the character's name. Opened anywhere else, its rolls go to
 * the whole table, as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';

const rollDice = vi.fn();

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({
    socket: { rollDice: (roll: unknown) => rollDice(roll), emitHitDiceSpend: vi.fn(), on: vi.fn(), off: vi.fn() },
  }),
}));
vi.mock('@/services/api', () => ({ api: { getUser: vi.fn().mockRejectedValue(new Error('Forbidden')) } }));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: ({ onRoll }: { onRoll?: (expression: string, purpose: string) => void }) => (
    <button type="button" onClick={() => onRoll?.('1d20+3', 'Perception')}>Perception</button>
  ),
}));

const character = {
  id: 'char-1', userId: 'npc-owner', name: 'Lich', gameSystem: 'DND_5E', data: {}, campaignId: 'camp-1',
  updatedAt: '2026-01-01T00:00:00.000Z', user: { id: 'npc-owner', displayName: 'The DM', avatarUrl: null },
} as unknown as Character;
const membership = { userId: 'dm', campaignId: 'camp-1', role: 'DM', characterIds: [] } as unknown as CampaignMembership;

beforeEach(() => {
  rollDice.mockReset().mockResolvedValue({ ok: true, id: 'roll-1' });
});

describe('rolls from a character sheet', () => {
  it('go to the DM alone when the sheet asks for secret rolls', async () => {
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} secretRolls onClose={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    expect(rollDice).toHaveBeenCalledWith(expect.objectContaining({ expression: '1d20+3', secret: true }));
  });

  it('go to the whole table otherwise', async () => {
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    expect(rollDice).toHaveBeenCalledWith(expect.not.objectContaining({ secret: true }));
  });
});
