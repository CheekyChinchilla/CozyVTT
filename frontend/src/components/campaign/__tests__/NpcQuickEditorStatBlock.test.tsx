/**
 * The token editor saves a stat block once typing stops, not on every
 * keystroke.
 *
 * Each keystroke in the stat block was a token save and then a `map.change`,
 * which rebuilds and resends the whole map to every player at the table, so
 * a sixty-letter trait was sixty saves and sixty map resends. The saves could
 * also finish out of order and leave an earlier keystroke stored.
 *
 * Now the edit is saved once typing pauses, or at once when focus leaves the
 * stat block or the editor closes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Token, NpcStatBlock } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const showToast = vi.fn();
const updateToken = vi.fn();
const emitMapChange = vi.fn();

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { emitMapChange } }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', memberships: [], gameSystem: 'DND_5E' }, currentMap: { id: 'map-1', feetPerSquare: 5 } }),
}));
vi.mock('@/services/api', () => {
  const client = { updateToken: (...args: unknown[]) => updateToken(...args), listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: {} }) };
  return { api: client, default: client };
});
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

import NpcQuickEditor from '../NpcQuickEditor';

const statBlock: NpcStatBlock = {
  ac: 15,
  speed: '30 ft.',
  abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
};
const goblin: Token = {
  id: 'goblin', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
  statBlock,
};

/** Open the stat block for editing and type `text` into its Speed box, a keystroke at a time. */
function typeSpeed(text: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const speed = screen.getByPlaceholderText('30 ft., fly 60 ft.');
  for (let i = 1; i <= text.length; i += 1) fireEvent.change(speed, { target: { value: text.slice(0, i) } });
  return speed;
}

/** The stat blocks saved, in order. */
const savedStatBlocks = () => updateToken.mock.calls.map((call) => (call[3] as { statBlock?: NpcStatBlock }).statBlock);

beforeEach(() => {
  showToast.mockClear();
  emitMapChange.mockClear();
  updateToken.mockReset();
  updateToken.mockImplementation((_c: string, _m: string, _t: string, changes: { statBlock?: NpcStatBlock }) =>
    Promise.resolve({ token: { ...goblin, statBlock: changes.statBlock } }));
});

describe('editing a stat block in the token editor', () => {
  it('saves once typing stops, with what was typed last, and tells the table once', async () => {
    render(<NpcQuickEditor token={goblin} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={() => {}} />);
    typeSpeed('40 ft., climb 20 ft.');

    expect(updateToken).not.toHaveBeenCalled();
    await waitFor(() => expect(updateToken).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(savedStatBlocks()[0]?.speed).toBe('40 ft., climb 20 ft.');
    await waitFor(() => expect(emitMapChange).toHaveBeenCalledTimes(1));
  });

  it('saves at once when focus leaves the stat block', async () => {
    render(<NpcQuickEditor token={goblin} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={() => {}} />);
    const speed = typeSpeed('25 ft.');

    fireEvent.blur(speed);
    await waitFor(() => expect(updateToken).toHaveBeenCalledTimes(1), { timeout: 300 });
    expect(savedStatBlocks()[0]?.speed).toBe('25 ft.');
  });

  it('saves what is still waiting when the editor closes', async () => {
    const { unmount } = render(<NpcQuickEditor token={goblin} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={() => {}} />);
    typeSpeed('35 ft.');

    act(() => unmount());
    await waitFor(() => expect(updateToken).toHaveBeenCalledTimes(1), { timeout: 300 });
    expect(savedStatBlocks()[0]?.speed).toBe('35 ft.');
    expect(updateToken.mock.calls[0][2]).toBe('goblin');
  });
});
