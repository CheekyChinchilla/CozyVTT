/**
 * The campaign page on a touch screen: the dividers between its panels.
 *
 * A divider is 6 pixels wide. The panel library widens the area that takes
 * a drag past what it draws, to 20 pixels by default where the primary
 * pointer is coarse; the page asks for 44, the size a finger needs, and
 * keeps a mouse's 10. The library reads the pointer once with matchMedia,
 * which jsdom does not answer, so what is checked is what the page asks for.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const groups = vi.hoisted(() => [] as Array<Record<string, unknown>>);

// The page subscribes to many socket events; each method is a harmless stub.
const anySocket = vi.hoisted(() => new Proxy({}, { get: () => () => undefined }));

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-resizable-panels', () => {
  const Box = ({ children }: { children?: unknown }) => <div>{children as never}</div>;
  const Group = (props: { children?: unknown } & Record<string, unknown>) => {
    groups.push(props);
    return <div>{props.children as never}</div>;
  };
  return {
    Group,
    Panel: Box,
    Separator: () => null,
    useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: () => undefined }),
    usePanelRef: () => ({ current: null }),
  };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm', displayName: 'DM' } }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  CampaignProvider: ({ children }: { children?: unknown }) => <>{children as never}</>,
  useCampaign: () => ({
    campaign: { id: 'campaign-1', name: 'Test', status: 'ACTIVE', ownerId: 'dm', memberships: [], characters: [] },
    currentMap: { id: 'map-1', name: 'Map', tokens: [] },
    loading: false,
    error: null,
    userRole: 'DM',
    updateCampaignStatus: vi.fn(),
    setActiveSession: vi.fn(),
    refreshCurrentMap: vi.fn(),
    catchUpAfterReconnect: vi.fn(),
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }: { children?: unknown }) => <>{children as never}</>,
  useWebSocket: () => ({ socket: anySocket, joinedEpoch: 1, status: 'connected' }),
}));
vi.mock('@/hooks/useInitiativeSync', () => ({ useInitiativeSync: () => undefined }));
vi.mock('@/hooks/useOnRejoin', () => ({ useOnRejoin: () => undefined }));
vi.mock('@/hooks/useAccessRevoked', () => ({ useAccessRevoked: () => undefined }));

const nothing = vi.hoisted(() => () => ({ default: () => null }));
vi.mock('@/components/campaign/CampaignInfo', nothing);
vi.mock('@/components/campaign/CampaignRoster', nothing);
vi.mock('@/components/campaign/MapManager', nothing);
vi.mock('@/components/campaign/TokenManager', nothing);
vi.mock('@/components/campaign/SpiritLayerControls', nothing);
vi.mock('@/components/campaign/AtmospherePanel', nothing);
vi.mock('@/components/campaign/AtmospherePlayer', nothing);
vi.mock('@/components/campaign/TableRefusals', nothing);
vi.mock('@/components/campaign/CreatureLibrary', nothing);
vi.mock('@/components/campaign/TokenTemplateLibrary', nothing);
vi.mock('@/components/campaign/CampaignSettingsModal', nothing);
vi.mock('@/components/documents/CampaignDocumentsModal', nothing);
vi.mock('@/components/campaign/SessionSidebar', nothing);
vi.mock('@/components/campaign/SessionToolbar', nothing);
vi.mock('@/components/ConnectionStatus', nothing);
vi.mock('@/components/campaign/MapCanvas', nothing);

vi.mock('@/components/campaign/TokenRoster', nothing);
vi.mock('@/components/campaign/NpcQuickEditor', nothing);

import CampaignPage from '../CampaignPage';

beforeEach(() => {
  groups.length = 0;
  window.localStorage.clear();
});

it('gives the panel dividers a 44-pixel grip for a finger, and a mouse its 10', () => {
  render(<CampaignPage />);

  expect(groups.length).toBeGreaterThan(0);
  for (const props of groups) expect(props.resizeTargetMinimumSize).toEqual({ coarse: 44, fine: 10 });
});
