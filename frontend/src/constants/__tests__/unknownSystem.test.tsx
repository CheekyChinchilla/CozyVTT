/**
 * A game system code this build has no member for: one the server still
 * stores for an unreleased system, kept until a migration moves its rows. It
 * is shown as Unsupported system, never as the code, and its sheet is shown
 * as a Flexible one with a line saying why.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignRole, type Character, type GameSystem, type RosterMember } from '@/types';
import { FLEXIBLE_SYSTEM_LABEL, UNSUPPORTED_SYSTEM_LABEL, gameSystemName, isSupportedOrNoSystem } from '@/constants/game-systems';
import GameSystemBadge from '@/components/common/GameSystemBadge';
import { CharacterSheetRouter } from '@/components/character-sheets/CharacterSheetRouter';
import { useGameStore } from '@/stores/gameStore';

const getCampaignCharacters = vi.fn();
const socket = { on: vi.fn(), off: vi.fn() };

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'c1', memberships: [] }, currentMap: null, viewedMap: null, userRole: 'GM' }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm' } }) }));
vi.mock('@/services/api', () => {
  const client = { getCampaignCharacters: (...a: unknown[]) => getCampaignCharacters(...a) };
  return { api: client, default: client };
});

import CampaignRoster from '@/components/campaign/CampaignRoster';

/** What the server sends for a character stored with a system this build does not have. */
const CODE = 'SOMETHING_ELSE';
const unknownSystem = CODE as GameSystem;
const NOTICE = 'This character was made for a game system CozyVTT no longer supports. Its data is kept; you can export or delete it.';

beforeEach(() => {
  getCampaignCharacters.mockReset();
  useGameStore.getState().clearGameState();
});

describe('a game system code this build does not have', () => {
  it('is named Unsupported system', () => {
    expect(UNSUPPORTED_SYSTEM_LABEL).toBe('Unsupported system');
    expect(gameSystemName(CODE)).toBe(UNSUPPORTED_SYSTEM_LABEL);
    expect(gameSystemName(null)).toBe(FLEXIBLE_SYSTEM_LABEL);
    expect(gameSystemName('FIFTH_EDITION')).not.toBe(UNSUPPORTED_SYSTEM_LABEL);
  });

  // The one rule for what a sheet can be edited, used or published from.
  it('is neither a supported system nor none, as each supported system and none are', () => {
    expect(isSupportedOrNoSystem(CODE)).toBe(false);
    for (const supported of ['FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100', null, undefined]) {
      expect(isSupportedOrNoSystem(supported)).toBe(true);
    }
  });

  it('is shown on its badge as Unsupported system, never as the code', () => {
    render(<GameSystemBadge gameSystem={unknownSystem} />);
    expect(screen.queryByText(CODE)).toBeNull();
    expect(screen.getByText(UNSUPPORTED_SYSTEM_LABEL).className).toContain('text-ink-muted');
  });

  it('is shown on its roster row as Unsupported system, never as the code', async () => {
    getCampaignCharacters.mockResolvedValue({
      roster: [{
        userId: 'p1', userName: 'Ash', userAvatar: null, role: CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z',
        characters: [{ id: 'c0', name: 'Old Hero', tokenImageUrl: null, gameSystem: unknownSystem, userId: 'p1', hp: null }],
      } satisfies RosterMember],
    });
    render(<CampaignRoster />);

    await screen.findByText('Old Hero');
    expect(screen.queryByText(CODE)).toBeNull();
    expect(screen.getByText(UNSUPPORTED_SYSTEM_LABEL)).toBeTruthy();
  });

  it('opens its sheet as a Flexible one, saying why', () => {
    const character: Character = {
      id: 'old-1', userId: 'user-1', name: 'Old Hero', gameSystem: unknownSystem, campaignId: null, tokenImageUrl: null,
      data: { sections: [{ id: 'notes', title: 'Story', type: 'text', value: 'Every word of it' }] },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    render(<CharacterSheetRouter character={character} mode="edit" />);

    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText('Every word of it')).toBeTruthy();
    expect(screen.queryByText(CODE)).toBeNull();
  });
});
