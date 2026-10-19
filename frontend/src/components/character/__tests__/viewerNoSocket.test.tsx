/**
 * On the Characters page there is no table to roll on. The owner's sheet still
 * offered its stats as rolls and its hit dice as spendable, and a click did
 * nothing at all.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Character } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => undefined,
}));
vi.mock('@/services/api', () => ({ api: {} }));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: ({ onRoll, onSpendHitDie }: { onRoll?: unknown; onSpendHitDie?: unknown }) => (
    <div>
      {onRoll ? <button type="button">Roll Stealth</button> : <span>Stealth</span>}
      {onSpendHitDie ? <button type="button">Spend hit die</button> : null}
    </div>
  ),
}));

const character = {
  id: 'char-1', userId: 'owner', name: 'Aldra', gameSystem: 'DND_5E', data: {}, campaignId: null,
} as unknown as Character;

describe('CharacterSheetViewerModal with no table', () => {
  it('offers no rolls and no hit dice to spend', () => {
    render(<CharacterSheetViewerModal character={character} onClose={() => {}} />);
    expect(screen.getByText('Stealth')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Roll Stealth' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Spend hit die' })).toBeNull();
  });
});
