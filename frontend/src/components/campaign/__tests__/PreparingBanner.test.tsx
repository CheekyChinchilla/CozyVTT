/**
 * The banner over a map the DM is preparing.
 *
 * It says which map is on the DM's screen and which the table is on, and
 * offers the two ways out: Back to the table, and Bring everyone here, which
 * moves the table as Set Active does, asking which of the table's tokens go
 * along. Whatever holds the map on screen (an editor with unsaved work) is
 * asked before the table moves. On the compact layout it fits a phone either
 * way up, and the phone's Back goes back to the table.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within, cleanup } from '@testing-library/react';
import { SHORT_SCREEN_QUERY, SIDEWAYS_QUERY } from '@/constants/layout';
import type { CampaignMap, Token } from '@/types';

const h = vi.hoisted(() => ({
  preparing: true,
  tableMap: { id: 'village', name: 'Village' } as { id: string; name: string } | null,
  compact: false,
  mayChange: true,
  backToTable: vi.fn(),
  showTableMap: vi.fn(),
  getMap: vi.fn(),
  setCurrentMap: vi.fn(),
  moveTokens: vi.fn(),
  showToast: vi.fn(),
  asked: vi.fn(),
  ended: null as { mapName: string; reason: 'deleted' | 'not-dm' } | null,
  clearEnded: vi.fn(),
  TableKeptMovingError: class TableKeptMovingError extends Error {},
}));

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', currentMapId: h.tableMap?.id ?? null },
    isPreparing: h.preparing,
    viewedMap: h.preparing ? { id: 'crypt', name: 'Crypt' } : h.tableMap,
    currentMap: h.tableMap,
    backToTable: h.backToTable,
    showTableMap: h.showTableMap,
    mayChangeViewedMap: (change: unknown) => { h.asked(change); return Promise.resolve(h.mayChange); },
    preparingEnded: h.ended,
    clearPreparingEnded: h.clearEnded,
  }),
  TableKeptMovingError: h.TableKeptMovingError,
}));
vi.mock('@/contexts/LayoutContext', () => ({ useCompactLayout: () => h.compact }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('@/services/map.service', () => ({
  default: { getMap: (...a: unknown[]) => h.getMap(...a), setCurrentMap: (...a: unknown[]) => h.setCurrentMap(...a) },
}));
vi.mock('@/services/api', () => ({ api: { moveTokens: (...a: unknown[]) => h.moveTokens(...a) } }));

import PreparingBanner from '../PreparingBanner';

const token = (id: string, name: string) => ({ id, name, layer: 'token' }) as unknown as Token;
const map = (id: string, tokens: Token[] = []) => ({ id, name: id, tokens }) as unknown as CampaignMap;

function sideways(on: boolean) {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    matches: on && (query === SHORT_SCREEN_QUERY || query === SIDEWAYS_QUERY), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  h.preparing = true;
  h.tableMap = { id: 'village', name: 'Village' };
  h.compact = false;
  h.mayChange = true;
  h.backToTable.mockReset().mockResolvedValue(true);
  h.showTableMap.mockReset();
  h.getMap.mockReset().mockImplementation((_c: string, id: string) => Promise.resolve(map(id, id === 'village' ? [token('hero', 'Hero')] : [])));
  h.setCurrentMap.mockReset().mockResolvedValue({});
  h.moveTokens.mockReset().mockResolvedValue({});
  h.showToast.mockReset();
  h.asked.mockReset();
  h.ended = null;
  h.clearEnded.mockReset();
  sideways(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const region = () => screen.getByRole('region', { name: 'Preparing a map' });

describe('the banner', () => {
  it('says which map is being prepared and which the table is on', () => {
    render(<PreparingBanner />);
    expect(region()).toHaveTextContent('Preparing Crypt. The table is on Village.');
    expect(screen.getByRole('button', { name: 'Back to the table' })).toHaveTextContent('Back to the table');
    expect(screen.getByRole('button', { name: 'Bring everyone here' })).toHaveTextContent('Bring everyone here');
  });

  it('says so when the table is on no map', () => {
    h.tableMap = null;
    render(<PreparingBanner />);
    expect(region()).toHaveTextContent('Preparing Crypt. The table is on no map.');
  });

  it('is not there while the page follows the table', () => {
    h.preparing = false;
    render(<PreparingBanner />);
    expect(screen.queryByRole('region', { name: 'Preparing a map' })).toBeNull();
  });

  it('goes back to the table', async () => {
    render(<PreparingBanner />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Back to the table' })); });
    expect(h.backToTable).toHaveBeenCalledTimes(1);
  });

  it("says why when the table's map cannot be loaded", async () => {
    h.backToTable.mockRejectedValue({ isAxiosError: true, response: { status: 500, data: { message: 'Failed to fetch map' } } });
    render(<PreparingBanner />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Back to the table' })); });
    expect(h.showToast).toHaveBeenCalledWith('Failed to fetch map', 'error');
  });

  it('says so when the table kept moving while its map loaded', async () => {
    h.backToTable.mockRejectedValue(new h.TableKeptMovingError('The table moved to another map while its map was loading.'));
    render(<PreparingBanner />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Back to the table' })); });
    expect(h.showToast).toHaveBeenCalledWith('The table moved to another map while its map was loading.', 'error');
  });
});

describe('Bring everyone here', () => {
  it("asks which of the table's tokens go along, then moves the table and shows it here", async () => {
    render(<PreparingBanner />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bring everyone here' })); });
    const dialog = await screen.findByRole('dialog', { name: 'Bring everyone here' });
    expect(h.getMap).toHaveBeenCalledWith('campaign-1', 'village');
    fireEvent.click(within(dialog).getByLabelText('Hero'));
    await act(async () => { fireEvent.click(within(dialog).getByText('Switch Map')); });
    expect(h.moveTokens).toHaveBeenCalledWith('campaign-1', 'village', ['hero'], 'crypt');
    expect(h.setCurrentMap).toHaveBeenCalledWith('campaign-1', 'crypt');
    await waitFor(() => expect(h.showTableMap).toHaveBeenCalledWith(expect.objectContaining({ id: 'crypt' })));
  });

  it('asks whatever holds the map on screen once the tokens are chosen, and moves nothing when it says no', async () => {
    h.mayChange = false;
    render(<PreparingBanner />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bring everyone here' })); });
    const dialog = await screen.findByRole('dialog', { name: 'Bring everyone here' });
    expect(h.asked).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(within(dialog).getByText('Switch Map')); });
    expect(h.asked).toHaveBeenCalledWith({ kind: 'bring-everyone', toMapId: 'crypt' });
    expect(h.moveTokens).not.toHaveBeenCalled();
    expect(h.setCurrentMap).not.toHaveBeenCalled();
  });

  it('asks nothing when the token choice is cancelled', async () => {
    render(<PreparingBanner />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bring everyone here' })); });
    const dialog = await screen.findByRole('dialog', { name: 'Bring everyone here' });
    fireEvent.click(within(dialog).getByText('Cancel'));
    expect(h.asked).not.toHaveBeenCalled();
  });
});

/** Whether the browser's current history entry is a sheet's. */
const onSheetEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

describe('on the compact layout', () => {
  beforeEach(() => {
    h.compact = true;
    window.history.pushState({}, '', '/dashboard');
    window.history.pushState({}, '', '/campaigns/campaign-1');
  });
  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(onSheetEntry()).toBe(false));
  });

  it('shows the short labels on a phone on its side, with the full ones as their names', () => {
    sideways(true);
    render(<PreparingBanner />);
    expect(screen.getByRole('button', { name: 'Back to the table' })).toHaveTextContent(/^Back$/);
    // The words shown begin the name, so a voice command for them finds it.
    expect(screen.getByRole('button', { name: 'Bring everyone here' })).toHaveTextContent(/^Bring everyone$/);
    expect(region().className.split(/\s+/)).not.toContain('flex-wrap');
  });

  it('wraps the names over the buttons upright', () => {
    render(<PreparingBanner />);
    expect(screen.getByRole('button', { name: 'Back to the table' })).toHaveTextContent('Back to the table');
    expect(region().className.split(/\s+/)).toContain('flex-wrap');
  });

  it("stays when the phone's Back is refused, and Back still works the next time", async () => {
    h.backToTable.mockResolvedValue(false);
    render(<PreparingBanner />);
    act(() => { window.history.back(); });
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(h.backToTable).toHaveBeenCalledTimes(1);
    expect(onSheetEntry()).toBe(true);
    act(() => { window.history.back(); });
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(h.backToTable).toHaveBeenCalledTimes(2);
  });

  it("goes back to the table on the phone's Back", async () => {
    render(<PreparingBanner />);
    expect(onSheetEntry()).toBe(true);
    act(() => { window.history.back(); });
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(h.backToTable).toHaveBeenCalledTimes(1);
  });
});

describe('what the banner says beyond the two buttons', () => {
  it('says which controls still reach the table', () => {
    render(<PreparingBanner />);
    const help = screen.getByRole('button', { name: 'What reaches the table?' });
    expect(help).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(region()).toHaveTextContent('Spirit Layer');
    expect(region()).toHaveTextContent('Atmosphere, the vibe and the session controls');
  });

  it('tells the DM why preparing ended when it ended from elsewhere', () => {
    h.preparing = false;
    h.ended = { mapName: 'Crypt', reason: 'deleted' };
    render(<PreparingBanner />);
    expect(h.showToast).toHaveBeenCalledWith("Crypt was deleted, so you are back on the table's map.", 'info');
    expect(h.clearEnded).toHaveBeenCalled();
  });

  it('tells a screen reader when preparing starts and ends, and puts the keyboard on the map', () => {
    const view = render(<><div role="application" aria-label="Map" tabIndex={0} /><PreparingBanner /></>);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing Crypt. The table is on Village.');
    h.preparing = false;
    view.rerender(<><div role="application" aria-label="Map" tabIndex={0} /><PreparingBanner /></>);
    expect(screen.getByRole('status')).toHaveTextContent("Back on the table's map, Village.");
    expect(document.activeElement).toBe(screen.getByRole('application', { name: 'Map' }));
  });
});
