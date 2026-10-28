/**
 * The campaign page hands Leave Campaign the handler that ends its table.
 *
 * The tab that leaves is told by the server's answer and by its socket's
 * notice, in either order, and says it once only because both reach the one
 * handler useAccessRevoked returns. The Campaign Info panel is given that
 * handler; a page that gave it anything else would say nothing on the answer
 * until the socket's notice came, or say it twice.
 */

import { it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// The page subscribes to many socket events; each method is a harmless stub.
const anySocket = vi.hoisted(() => new Proxy({}, { get: () => () => undefined }));

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-resizable-panels', () => {
  const Box = ({ children }: { children?: unknown }) => <div>{children as never}</div>;
  return {
    Group: Box,
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
// The page's handler for the end of its table, as useAccessRevoked returns it.
const endTable = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAccessRevoked', () => ({ useAccessRevoked: () => endTable }));

const nothing = vi.hoisted(() => () => ({ default: () => null }));
const infoProps = vi.hoisted(() => [] as Array<{ onLeft?: unknown }>);
vi.mock('@/components/campaign/CampaignInfo', () => ({
  default: (props: { onLeft?: unknown }) => { infoProps.push(props); return null; },
}));
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

it("gives the Campaign Info panel the page's own end-of-table handler", () => {
  render(<CampaignPage />);

  expect(infoProps.length).toBeGreaterThan(0);
  expect(infoProps.every((props) => props.onLeft === endTable)).toBe(true);
});
