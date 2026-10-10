/**
 * A save that finishes after the token quick editor has closed, or moved on
 * to another token, does not bring the old one back.
 *
 * The editor saves a stat block once typing pauses, and straight away when it
 * closes, so the answer usually arrives after the DM has closed it or opened
 * another token. The page set the edited token as the one being edited on
 * every answer, so the editor opened again on its own, or jumped back to the
 * token before.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Token } from '@/types';

const editor = vi.hoisted(() => ({ onTokenUpdate: null as ((t: Token) => void) | null }));
// The page subscribes to many socket events; each method is a harmless stub.
const anySocket = vi.hoisted(() => new Proxy({}, { get: () => () => undefined }));
const tokens = vi.hoisted(() => ({
  a: { id: 'tok-a', name: 'Goblin A' },
  b: { id: 'tok-b', name: 'Goblin B' },
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
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

// The roster opens a token in the quick editor, as its Edit buttons do.
vi.mock('@/components/campaign/TokenRoster', () => ({
  default: ({ onEditToken }: { onEditToken: (t: Token) => void }) => (
    <>
      <button onClick={() => onEditToken(tokens.a as unknown as Token)}>Edit Goblin A</button>
      <button onClick={() => onEditToken(tokens.b as unknown as Token)}>Edit Goblin B</button>
    </>
  ),
}));
// The editor: shows which token it holds, closes, and keeps the callback a
// finished save calls, so the test can answer a save after the editor moved on.
vi.mock('@/components/campaign/NpcQuickEditor', () => ({
  default: ({ token, onClose, onTokenUpdate }: { token: Token; onClose: () => void; onTokenUpdate: (t: Token) => void }) => {
    editor.onTokenUpdate = onTokenUpdate;
    return (
      <div role="dialog" aria-label={`Quick edit ${token.name}`}>
        <button onClick={onClose}>Close editor</button>
      </div>
    );
  },
}));

import CampaignPage from '../CampaignPage';

beforeEach(() => {
  editor.onTokenUpdate = null;
});

const open = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Edit ${name}` }));
const editorFor = (name: string) => screen.queryByRole('dialog', { name: `Quick edit ${name}` });

describe('the token quick editor and saves that finish late', () => {
  it('stays closed when a save finishes after it was closed', () => {
    render(<CampaignPage />);
    open('Goblin A');
    const finishSave = editor.onTokenUpdate!;
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => finishSave({ ...tokens.a } as unknown as Token));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays on the token now open when the last one finishes saving', () => {
    render(<CampaignPage />);
    open('Goblin A');
    const finishSaveOfA = editor.onTokenUpdate!;
    open('Goblin B');
    expect(editorFor('Goblin B')).not.toBeNull();

    act(() => finishSaveOfA({ ...tokens.a } as unknown as Token));

    expect(editorFor('Goblin B')).not.toBeNull();
    expect(editorFor('Goblin A')).toBeNull();
  });

  it('shows the saved token while it is still the one open', () => {
    render(<CampaignPage />);
    open('Goblin A');

    act(() => editor.onTokenUpdate!({ ...tokens.a, name: 'Goblin A (renamed)' } as unknown as Token));

    expect(editorFor('Goblin A (renamed)')).not.toBeNull();
  });
});
