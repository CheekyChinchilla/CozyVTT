/**
 * The browser's Back on the compact layout with a window open over the map
 * and no sheet under it.
 *
 * A row of More, or of a token's action sheet, closes its sheet and opens a
 * window: one of the DM's slide-overs, Edit Token, the character sheet. The
 * sheet took its history entry back off as it closed, so the window held
 * none and Back left the campaign page, losing whatever was typed in it. A
 * window on the compact layout now holds the entry as a sheet does: Back
 * closes it through its own close, the one Escape calls, so the editor asks
 * Discard Changes? first, and the page stays. The desktop's history is as
 * it was.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { TableHosts } from '@/components/campaign/tableHosts';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { useGameStore } from '@/stores/gameStore';
import SlideOver, { SlideOverClose, SlideOverTitle } from '@/components/ui/SlideOver';
import Modal from '@/components/ui/Modal';
import type { MenuItem } from '@/components/ui/menu';
import CharacterSheetViewerModal from '@/components/character/CharacterSheetViewerModal';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';
import { waitForDialogFocus } from '@/test/dialogFocus';
import { CampaignStatus } from '@/types';
import type { Campaign, CampaignMembership, Character } from '@/types';
import type { SessionToolKey } from '@/components/campaign/SessionToolbar';
import ActionSheet from '../ActionSheet';

vi.mock('react-router', () => ({ useNavigate: () => () => undefined }));
vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ userRole: 'DM' }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ status: 'connected', error: null, reconnect: () => undefined }),
  useOptionalWebSocket: () => null,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/services/api', () => ({ api: { getUser: vi.fn(), getCharacter: vi.fn(), updateCharacter: vi.fn() } }));

import CompactTable from '../CompactTable';

/** Whether the browser's current history entry is a sheet's. */
const onSheetEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

/** The campaign page's address, with the page the player came from before it. */
function arriveAt(path: string) {
  window.history.pushState({}, '', '/dashboard');
  window.history.pushState({}, '', path);
}

/** The browser's Back, and the moment it takes to land. */
async function pressBack() {
  act(() => { window.history.back(); });
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

beforeEach(() => {
  act(() => { useGameStore.getState().clearGameState(); });
});

afterEach(async () => {
  cleanup();
  await waitFor(() => expect(onSheetEntry()).toBe(false));
});

const campaign = { id: 'c1', name: 'The Sunken Crown', status: CampaignStatus.ACTIVE, ownerId: 'owner', memberships: [], characters: [] } as unknown as Campaign;

/** The page's Map Library slide-over, which More's row asks for. */
function MapLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SlideOver open={open} onClose={onClose}>
      <SlideOverTitle>Map Library</SlideOverTitle>
      <SlideOverClose />
      <input aria-label="Map name" />
    </SlideOver>
  );
}

/** The compact arrangement under the page, with its Map Library, and `party` as the Party content. */
function CompactPage({ party = <button type="button">party content</button> }: { party?: ReactNode }) {
  const [maps, setMaps] = useState(false);
  const parts = { map: <div>the map</div>, session: <button type="button">session panels</button>, party };
  return (
    <LayoutProvider compact>
      <TableHosts parts={parts}>
        <CompactTable
          campaign={campaign}
          isOwner
          onOpenTool={(key: SessionToolKey) => { if (key === 'maps') setMaps(true); }}
          onOpenDocuments={() => undefined}
          onOpenShortcuts={() => undefined}
        />
      </TableHosts>
      <MapLibrary open={maps} onClose={() => setMaps(false)} />
    </LayoutProvider>
  );
}

const bar = () => screen.getByRole('navigation', { name: 'Table' });
const press = (name: string) => fireEvent.click(within(bar()).getByRole('button', { name: new RegExp(`^${name}`) }));
/** A sheet, open or not, by its title. */
const sheet = (title: string) => {
  const found = [...document.querySelectorAll<HTMLElement>('[data-sheet]')].find((el) => el.querySelector('h2')?.textContent === title);
  if (!found) throw new Error(`no sheet ${title}`);
  return found;
};
const isOpen = (title: string) => sheet(title).dataset.state === 'open';

/** Opens More and presses its row `label`. The sheet slides in, and its rows have no accessible name until it has begun to. */
async function pressMoreRow(label: string) {
  press('More');
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  const row = within(sheet('More')).getByText(label).closest('button');
  if (!row) throw new Error(`no row ${label}`);
  fireEvent.click(row);
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

describe("Back with one of More's windows open", () => {
  it('closes the window and stays on the page, and the next Back leaves the page as before', async () => {
    arriveAt('/campaigns/c1');
    render(<CompactPage />);
    await pressMoreRow('Map Library');
    expect(screen.getByRole('dialog', { name: 'Map Library' })).toBeInTheDocument();
    expect(isOpen('More')).toBe(false);

    await pressBack();
    expect(window.location.pathname).toBe('/campaigns/c1');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Map Library' })).toBeNull());
    // Nothing is open, so the entry is taken back off.
    await waitFor(() => expect(onSheetEntry()).toBe(false));

    await pressBack();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });

  it('is taken back off the history when the window closes by its own X, so the next Back leaves the page', async () => {
    arriveAt('/campaigns/c2');
    render(<CompactPage />);
    await pressMoreRow('Map Library');
    expect(onSheetEntry()).toBe(true);

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Map Library' })).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Map Library' })).toBeNull());
    await waitFor(() => expect(onSheetEntry()).toBe(false));
    expect(window.location.pathname).toBe('/campaigns/c2');

    await pressBack();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });
});

describe('Back with a window opened over a sheet', () => {
  /** The Party content, with a button that opens a window over the Party sheet. */
  function PartyWithWindow() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Leave Campaign</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Leave this campaign?"><button type="button">Leave</button></Modal>
      </>
    );
  }

  it('closes the window, then the sheet, then leaves the page', async () => {
    arriveAt('/campaigns/c3');
    render(<CompactPage party={<PartyWithWindow />} />);
    press('Party');
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    fireEvent.click(within(sheet('Party')).getByText('Leave Campaign'));
    expect(screen.getByRole('dialog', { name: 'Leave this campaign?' })).toBeInTheDocument();

    await pressBack();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Leave this campaign?' })).toBeNull());
    expect(isOpen('Party')).toBe(true);
    expect(window.location.pathname).toBe('/campaigns/c3');
    expect(onSheetEntry()).toBe(true);

    await pressBack();
    await waitFor(() => expect(isOpen('Party')).toBe(false));
    expect(window.location.pathname).toBe('/campaigns/c3');
    await waitFor(() => expect(onSheetEntry()).toBe(false));

    await pressBack();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });
});

describe("Back with a window a token's action sheet opened", () => {
  const sheetCharacter = { ...pf2eCharacter(), userId: 'owner' } as Character;
  const membership = { userId: 'owner', campaignId: sheetCharacter.campaignId, role: 'PLAYER', characterIds: [] } as unknown as CampaignMembership;

  /**
   * The map's token menu as an action sheet, as MapCanvas draws it on the
   * compact layout: View Character Sheet loads the character and then opens
   * the sheet, after the menu has closed; Edit Token opens the page's editor.
   */
  function TokenMenuPage() {
    const [menu, setMenu] = useState(true);
    const [viewing, setViewing] = useState<Character | null>(null);
    const [editingToken, setEditingToken] = useState(false);
    const items: MenuItem[] = [
      { kind: 'command', id: 'view-sheet', label: 'View Character Sheet', run: () => { void Promise.resolve(sheetCharacter).then(setViewing); } },
      { kind: 'command', id: 'edit-token', label: 'Edit Token', run: () => setEditingToken(true) },
    ];
    return (
      <LayoutProvider compact>
        {menu && <ActionSheet open title="Valeros" items={items} onClose={() => setMenu(false)} />}
        {viewing && (
          <CharacterSheetViewerModal character={viewing} campaignId={viewing.campaignId ?? undefined} membership={membership} onClose={() => setViewing(null)} />
        )}
        <SlideOver open={editingToken} onClose={() => setEditingToken(false)}>
          <SlideOverTitle>Edit Token</SlideOverTitle>
          <input aria-label="Token name" />
        </SlideOver>
      </LayoutProvider>
    );
  }

  const editor = () => screen.queryByRole('dialog', { name: `Edit Character Sheet: ${sheetCharacter.name}` });
  const viewer = () => screen.queryByRole('dialog', { name: sheetCharacter.name });
  const discardQuestion = () => screen.queryByRole('dialog', { name: 'Discard Changes?' });

  it('asks Discard Changes? before closing the editor opened from the sheet, and the page stays', async () => {
    arriveAt('/campaigns/c4');
    render(<TokenMenuPage />);
    fireEvent.click(screen.getByRole('button', { name: 'View Character Sheet' }));
    await waitFor(() => expect(viewer()).toBeInTheDocument());
    await waitForDialogFocus(viewer() as HTMLElement);

    fireEvent.click(within(viewer() as HTMLElement).getByRole('button', { name: /Edit/ }));
    await waitFor(() => expect(editor()).toBeInTheDocument());
    await waitForDialogFocus(editor() as HTMLElement);
    await userEvent.type(screen.getByPlaceholderText('Deity'), 'Torag');

    await pressBack();
    expect(window.location.pathname).toBe('/campaigns/c4');
    await waitFor(() => expect(discardQuestion()).toBeInTheDocument());
    expect(editor()).toBeInTheDocument();

    // Keep Editing keeps the editor, what was typed and the page.
    fireEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));
    await waitFor(() => expect(discardQuestion()).toBeNull());
    expect(screen.getByPlaceholderText('Deity')).toHaveValue('Torag');
    expect(window.location.pathname).toBe('/campaigns/c4');
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(onSheetEntry()).toBe(true);

    // Back asks again, and Discard closes the editor, leaving the sheet.
    await pressBack();
    await waitFor(() => expect(discardQuestion()).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(editor()).toBeNull());
    expect(viewer()).toBeInTheDocument();
    expect(window.location.pathname).toBe('/campaigns/c4');
    expect(onSheetEntry()).toBe(true);

    // Back closes the sheet, and the next leaves the page.
    await pressBack();
    await waitFor(() => expect(viewer()).toBeNull());
    expect(window.location.pathname).toBe('/campaigns/c4');
    await waitFor(() => expect(onSheetEntry()).toBe(false));

    await pressBack();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });

  it('closes Edit Token and stays on the page', async () => {
    arriveAt('/campaigns/c5');
    render(<TokenMenuPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Token' }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.getByRole('dialog', { name: 'Edit Token' })).toBeInTheDocument();

    await pressBack();
    expect(window.location.pathname).toBe('/campaigns/c5');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Token' })).toBeNull());
    await waitFor(() => expect(onSheetEntry()).toBe(false));
  });
});

describe('a window on the desktop', () => {
  it('puts nothing on the history, so Back leaves the page as it always did', async () => {
    arriveAt('/campaigns/c6');
    const length = window.history.length;
    function Desktop() {
      const [open, setOpen] = useState(true);
      return (
        <LayoutProvider compact={false}>
          <Modal open={open} onClose={() => setOpen(false)} title="Map Library"><input aria-label="Map name" /></Modal>
        </LayoutProvider>
      );
    }
    render(<Desktop />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(window.history.length).toBe(length);
    expect(onSheetEntry()).toBe(false);

    await pressBack();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    expect(screen.getByRole('dialog', { name: 'Map Library' })).toBeInTheDocument();
  });
});
