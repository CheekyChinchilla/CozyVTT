/**
 * The keyboard shortcuts window opens from the header's Keyboard shortcuts
 * button and from the map's ? key, and the page holds it, so there is one
 * window whichever opened it.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'p1', displayName: 'Mara' } }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  CampaignProvider: ({ children }: { children?: unknown }) => <>{children as never}</>,
  useCampaign: () => ({
    campaign: { id: 'campaign-1', name: 'Test', status: 'ACTIVE', ownerId: 'dm', memberships: [], characters: [] },
    currentMap: { id: 'map-1', name: 'Map', tokens: [] },
    loading: false,
    error: null,
    userRole: 'PLAYER',
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
vi.mock('@/components/campaign/AtmospherePlayer', nothing);
vi.mock('@/components/campaign/TableRefusals', nothing);
vi.mock('@/components/campaign/CampaignSettingsModal', nothing);
vi.mock('@/components/documents/CampaignDocumentsModal', nothing);
vi.mock('@/components/campaign/SessionSidebar', nothing);
vi.mock('@/components/ConnectionStatus', nothing);
// The map stands in for its ? key with a button.
vi.mock('@/components/campaign/MapCanvas', () => ({
  default: ({ onShowShortcuts }: { onShowShortcuts?: () => void }) => (
    <button type="button" onClick={() => onShowShortcuts?.()}>Press ? on the map</button>
  ),
}));

import CampaignPage from '../CampaignPage';

const shortcutsWindow = () => screen.queryByRole('dialog', { name: 'Keyboard shortcuts' });

describe('the keyboard shortcuts window on the campaign page', () => {
  it("opens from the header's Keyboard shortcuts button, showing a player's shortcuts", () => {
    render(<CampaignPage />);
    expect(shortcutsWindow()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));

    expect(shortcutsWindow()).not.toBeNull();
    expect(screen.getByText('Move the selected token one square')).toBeInTheDocument();
    expect(screen.queryByText('Undo the last wall change')).not.toBeInTheDocument();
  });

  it("opens when the map hears ?, and closes again", async () => {
    render(<CampaignPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Press ? on the map' }));
    expect(shortcutsWindow()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    // The window fades out before it leaves the page.
    await waitFor(() => expect(shortcutsWindow()).toBeNull());
  });
});
