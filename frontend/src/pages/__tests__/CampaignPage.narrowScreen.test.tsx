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
import { render, screen, fireEvent, act } from '@testing-library/react';

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
import Modal from '@/components/ui/Modal';
import SlideOver, { SlideOverTitle } from '@/components/ui/SlideOver';

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

// The notice sat at z-50 inside the page, where a side panel or a window
// opened over another (z-60) could cover it.
it('covers every side panel and window, from the top of the page', () => {
  render(
    <>
      <CampaignPage />
      <SlideOver open onClose={() => {}}><SlideOverTitle>Token Manager</SlideOverTitle></SlideOver>
      <Modal open layer="overlay" onClose={() => {}} title="Invite Player"><p>invite</p></Modal>
    </>
  );
  const layer = (el: Element) => Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec(el.getAttribute('class') ?? '')?.[1] ?? 0);
  const cover = notice()!.closest('.fixed') as HTMLElement;

  expect(cover.parentElement).toBe(document.body);
  const others = [...document.body.querySelectorAll('[class*="z-"]')].filter((el) => !cover.contains(el));
  expect(others.length).toBeGreaterThan(0);
  for (const el of others) expect(layer(cover)).toBeGreaterThan(layer(el));
});

// Above a window or side panel, the notice was out of reach of the keyboard:
// the window's focus trap kept Tab, and Escape closed the window under it.
it('takes the keyboard while the window is narrow', async () => {
  const narrow = (query: string): MediaQueryList => ({
    matches: query.includes('max-width'), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
  vi.stubGlobal('matchMedia', narrow);
  const onClose = vi.fn();
  try {
    render(
      <>
        <Modal open onClose={onClose} title="Invite Player"><input aria-label="Search" /></Modal>
        <CampaignPage />
      </>
    );
    const dialog = screen.getByRole('dialog', { name: 'Desktop Required' });
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
