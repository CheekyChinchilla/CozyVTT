/**
 * A roll from a sheet opened on a token is filed under the name the whole
 * table may see. Opened from a hidden, spirit-plane or obscured token, the
 * dice log named the character anyway, while Roll... on the same menu said
 * "Unknown creature".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';

const emitDiceRoll = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({ socket: { emitDiceRoll, emitHitDiceSpend: vi.fn(), on: vi.fn(), off: vi.fn() } }),
}));
vi.mock('@/services/api', () => ({
  api: { getUser: vi.fn().mockResolvedValue({ user: { displayName: 'Owner' } }) },
}));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: ({ onRoll }: { onRoll?: (expression: string, purpose: string) => void }) => (
    <button type="button" onClick={() => onRoll?.('1d20+3', 'Stealth')}>Stealth</button>
  ),
}));

const character = {
  id: 'char-1', userId: 'owner', name: 'Shadow Assassin', gameSystem: 'DND_5E', data: {}, campaignId: 'camp-1',
} as unknown as Character;
const membership = { userId: 'dm', campaignId: 'camp-1', role: 'DM', characterIds: [] } as unknown as CampaignMembership;

describe('CharacterSheetViewerModal rolls', () => {
  it('names the character when no public name is given', () => {
    emitDiceRoll.mockClear();
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Stealth'));
    expect(emitDiceRoll).toHaveBeenCalledWith(expect.objectContaining({ characterName: 'Shadow Assassin' }));
  });

  it('files the roll under the public name it was opened with', () => {
    emitDiceRoll.mockClear();
    render(
      <CharacterSheetViewerModal
        character={character}
        campaignId="camp-1"
        membership={membership}
        publicName="Unknown creature"
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByText('Stealth'));
    expect(emitDiceRoll).toHaveBeenCalledWith(expect.objectContaining({ characterName: 'Unknown creature' }));
  });
});
