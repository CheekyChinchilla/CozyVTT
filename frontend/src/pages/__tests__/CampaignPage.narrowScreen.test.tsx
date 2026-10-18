/**
 * The campaign page below 1024 pixels wide.
 *
 * A window narrower than that got a "Desktop Required" notice and no way
 * past it, so a laptop with two windows side by side was refused like a
 * phone. **Continue anyway** now shows the table in its desktop layout, and
 * the browser remembers the choice. Storage the browser refuses (blocked
 * site data, some private windows) made reading it throw, which took the
 * page down; the page now carries on without it.
 */

import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
vi.mock('@/hooks/useAccessRevoked', () => ({ useAccessRevoked: () => undefined }));

const nothing = vi.hoisted(() => () => ({ default: () => null }));
vi.mock('@/components/campaign/CampaignInfo', nothing);
vi.mock('@/components/campaign/CampaignRoster', nothing);
vi.mock('@/components/campaign/MapManager', nothing);
vi.mock('@/components/campaign/TokenManager', nothing);
vi.mock('@/components/campaign/SpiritLayerControls', nothing);
vi.mock('@/components/campaign/AtmospherePanel', nothing);
vi.mock('@/components/campaign/AtmospherePlayer', nothing);
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

const KEY = 'cozyvtt.continueOnNarrowScreen';
const realStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')!;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, 'localStorage', realStorage);
});

const notice = () => screen.queryByRole('heading', { name: 'Desktop Required' });
const table = () => document.querySelector('main')!;

it('offers Continue anyway, which shows the table and is remembered', () => {
  const { unmount } = render(<CampaignPage />);
  expect(notice()).not.toBeNull();
  expect(table().className).toMatch(/(^|\s)hidden(\s|$)/);

  fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));

  expect(notice()).toBeNull();
  expect(table().className).not.toMatch(/(^|\s)hidden(\s|$)/);
  expect(window.localStorage.getItem(KEY)).toBe('yes');

  unmount();
  render(<CampaignPage />);
  expect(notice()).toBeNull();
});

it('opens, and continues for this page, when the browser refuses storage', () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
  });

  render(<CampaignPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));

  expect(notice()).toBeNull();
});
