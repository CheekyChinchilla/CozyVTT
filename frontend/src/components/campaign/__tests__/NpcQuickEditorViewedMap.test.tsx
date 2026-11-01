/**
 * The quick editor reads the scale of the map on screen.
 *
 * While the DM prepares a map, the map on screen is not the table's, and its
 * feet per square can differ: a token's vision is shown in feet as that map
 * measures them.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const showToast = vi.fn();
const onClose = vi.fn();
const emitMapChange = vi.fn();

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    useReducedMotionConfig: () => false,
    useIsPresent: () => true,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { emitMapChange } }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', memberships: [] }, currentMap: { id: 'map-table', feetPerSquare: 5 }, viewedMap: { id: 'map-1', feetPerSquare: 10 } }),
}));
const api = vi.hoisted(() => ({
  deleteToken: vi.fn(),
  updateToken: vi.fn(),
  listAssets: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

import NpcQuickEditor from '../NpcQuickEditor';

const goblin: Token = {
  id: 'goblin', name: 'Goblin Boss', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
});

it("gives a token's vision in feet as the map on screen measures them", () => {
  render(<NpcQuickEditor token={goblin} campaignId="campaign-1" mapId="map-1" onClose={onClose} onTokenUpdate={() => {}} />);
  expect(screen.getByText(/12 = 120 ft on this map/)).toBeInTheDocument();
});
