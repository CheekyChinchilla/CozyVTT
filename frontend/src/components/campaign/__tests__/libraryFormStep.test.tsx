/**
 * On a narrow screen the Creature Library's and Token Templates' forms are a
 * step of their own.
 *
 * Each form opened under its list, up to 70 percent of the screen's height
 * (60 for a template), so on a phone the list above it had next to no room
 * and the form scrolled in a box of its own. Below 1,024 px, the width the
 * campaign page changes at, the form now takes the list's place: the list is
 * hidden, **Back to the list** leads back to it, focus moves to the form's
 * heading as it opens, and back to the control that opened it as it closes,
 * by Back, Cancel or a save, or to the list's own create button when that
 * control has gone. From 1,024 px up the form opens under the list as before,
 * with its own X, its border and its height cap, and no focus moves.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreatureTemplate, TokenTemplate } from '@/types';
import { TokenType, TokenDisposition } from '@/types';
import { waitForDialogFocus } from '@/test/dialogFocus';
import { COMPACT_LAYOUT_QUERY } from '@/constants/layout';
import CreatureLibrary from '../CreatureLibrary';
import TokenTemplateLibrary from '../TokenTemplateLibrary';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: null }, currentMap: null }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  listCreatures: vi.fn(),
  getSeedStatus: vi.fn(),
  listCreatureFavorites: vi.fn(),
  updateCreature: vi.fn(),
  listTokenTemplates: vi.fn(),
  listCampaigns: vi.fn(),
  storedAssetSrc: (s: string) => s,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

const statBlock = { ac: 12, speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };

const bat = {
  id: 'c1', name: 'Boss Bat', source: 'custom', challengeRating: '1', imageUrl: null, statBlock,
  size: { width: 1, height: 1 }, disposition: 'hostile', displayMode: 'pog', campaignId: 'campaign-1',
} as unknown as CreatureTemplate;

const chest: TokenTemplate = {
  id: 'template-1', name: 'Treasure Chest', imageUrl: null, type: TokenType.OBJECT, disposition: TokenDisposition.NEUTRAL,
  displayMode: 'pog', size: { width: 1, height: 1 }, notes: null, hp: null,
  showHpBar: false, statBlock: null, sightRadius: null, campaignId: 'campaign-1', createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

/** A screen of the given kind: narrow answers the compact layout's query. */
function screenIs(kind: 'narrow' | 'wide') {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    matches: kind === 'narrow' && query === COMPACT_LAYOUT_QUERY,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** A media query list whose answer can change, telling its listeners as a browser does. */
class TurnableQuery extends EventTarget implements MediaQueryList {
  readonly media: string;
  readonly answer: () => boolean;
  onchange = null;
  constructor(media: string, answer: () => boolean) {
    super();
    this.media = media;
    this.answer = answer;
  }
  get matches() { return this.answer(); }
  addListener() {}
  removeListener() {}
}

/** A screen that starts narrow or wide and can be turned, as an iPad can or a window resized. */
function liveScreen(start: 'narrow' | 'wide') {
  let kind = start;
  const lists: TurnableQuery[] = [];
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    const list = new TurnableQuery(query, () => kind === 'narrow' && query === COMPACT_LAYOUT_QUERY);
    lists.push(list);
    return list;
  });
  return (next: 'narrow' | 'wide') => {
    kind = next;
    act(() => lists.forEach((list) => list.dispatchEvent(new Event('change'))));
  };
}

const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

/** The form's heading row, which holds its own X where it has one. */
const headingRow = (name: string) => screen.getByRole('heading', { name }).parentElement as HTMLElement;
/** The form itself: the box its heading row sits in. */
const form = (name: string) => headingRow(name).parentElement;

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreatures.mockResolvedValue({ creatures: [bat], total: 1 });
  api.getSeedStatus.mockResolvedValue({ srdCount: 1 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.updateCreature.mockImplementation(async (_c: string, _id: string, data: Partial<CreatureTemplate>) => ({ ...bat, ...data }));
  api.listTokenTemplates.mockResolvedValue({ templates: [chest], total: 1, limit: 100, offset: 0 });
  api.listCampaigns.mockResolvedValue({ campaigns: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openCreatureLibrary() {
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await waitForDialogFocus();
  await screen.findByText('Boss Bat');
}

async function openTemplates() {
  render(<TokenTemplateLibrary isOpen onClose={() => {}} />);
  await waitForDialogFocus();
  await screen.findByText('Treasure Chest');
}

describe('the Creature Library on a narrow screen', () => {
  beforeEach(() => screenIs('narrow'));

  it('opens Create Custom in place of the list, and Back to the list returns to Create Custom', async () => {
    await openCreatureLibrary();
    await userEvent.click(screen.getByRole('button', { name: 'Create Custom' }));

    const heading = screen.getByRole('heading', { name: 'Create Custom Creature' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByPlaceholderText('Search creatures...')).not.toBeVisible();
    expect(screen.getByText('Boss Bat')).not.toBeVisible();
    // Hidden by a class of its own too, so the base styles' [hidden] rule is not needed.
    expect(classes(screen.getByPlaceholderText('Search creatures...').closest('[hidden]'))).toEqual(['hidden']);
    // Back to the list does what the form's X does, so the step has no X.
    expect(within(headingRow('Create Custom Creature')).queryByRole('button')).toBeNull();
    expect(classes(form('Create Custom Creature'))).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']));
    expect(classes(form('Create Custom Creature'))).not.toContain('max-h-[70vh]');

    await userEvent.click(screen.getByRole('button', { name: 'Back to the list' }));

    expect(screen.queryByRole('heading', { name: 'Create Custom Creature' })).toBeNull();
    expect(screen.getByPlaceholderText('Search creatures...')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Custom' })).toHaveFocus());
  });

  it('goes back to the list on Cancel too', async () => {
    await openCreatureLibrary();
    await userEvent.click(screen.getByRole('button', { name: 'Create Custom' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Boss Bat')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Custom' })).toHaveFocus());
  });

  it('edits a creature as a step, and gives focus back to its Edit button once saved', async () => {
    await openCreatureLibrary();
    await userEvent.click(screen.getByText('Boss Bat'));
    await userEvent.click(screen.getByTitle('Edit creature'));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Creature' })).toHaveFocus());
    expect(screen.getByPlaceholderText('Search creatures...')).not.toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.updateCreature).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Creature' })).toBeNull());
    await waitFor(() => expect(screen.getByTitle('Edit creature')).toHaveFocus());
  });
});

describe('the Creature Library when the control that opened the form has gone', () => {
  it('gives focus to Create Custom after an Edit opened wide is left on a narrow screen', async () => {
    const turn = liveScreen('wide');
    await openCreatureLibrary();
    await userEvent.click(screen.getByText('Boss Bat'));
    await userEvent.click(screen.getByTitle('Edit creature'));
    // Wide, the row folded away, and its Edit button with it.
    turn('narrow');
    await userEvent.click(screen.getByRole('button', { name: 'Back to the list' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Custom' })).toHaveFocus());
  });

  it('gives focus to Create Custom after the panel was closed and opened again on the step', async () => {
    liveScreen('narrow');
    const { rerender } = render(<CreatureLibrary isOpen onClose={() => {}} />);
    await waitForDialogFocus();
    await screen.findByText('Boss Bat');
    await userEvent.click(screen.getByRole('button', { name: 'Create Custom' }));
    rerender(<CreatureLibrary isOpen={false} onClose={() => {}} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(<CreatureLibrary isOpen onClose={() => {}} />);
    await waitForDialogFocus(await screen.findByRole('dialog'));
    await userEvent.click(screen.getByRole('button', { name: 'Back to the list' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Custom' })).toHaveFocus());
  });
});

describe('the Creature Library on a wide screen', () => {
  beforeEach(() => screenIs('wide'));

  it('opens the form under the list, as before', async () => {
    await openCreatureLibrary();
    await userEvent.click(screen.getByRole('button', { name: 'Create Custom' }));

    const heading = screen.getByRole('heading', { name: 'Create Custom Creature' });
    expect(heading).toBeVisible();
    expect(heading).not.toHaveFocus();
    expect(screen.getByPlaceholderText('Search creatures...')).toBeVisible();
    expect(screen.getByText('Boss Bat')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back to the list' })).toBeNull();
    expect(classes(screen.getByPlaceholderText('Search creatures...').closest('.contents'))).toEqual(['contents']);
  });

  it('keeps the form its border and its height cap', async () => {
    await openCreatureLibrary();
    await userEvent.click(screen.getByRole('button', { name: 'Create Custom' }));

    expect(classes(form('Create Custom Creature'))).toEqual(expect.arrayContaining(['border-t', 'max-h-[70vh]', 'overflow-y-auto']));
    expect(classes(form('Create Custom Creature'))).not.toContain('flex-1');
  });

  it("keeps the form's own X, which closes it", async () => {
    await openCreatureLibrary();
    await userEvent.click(screen.getByRole('button', { name: 'Create Custom' }));
    await userEvent.click(within(headingRow('Create Custom Creature')).getByRole('button'));

    expect(screen.queryByRole('heading', { name: 'Create Custom Creature' })).toBeNull();
  });

  it('moves no focus as the form closes, on Cancel or a save', async () => {
    await openCreatureLibrary();
    await userEvent.click(screen.getByRole('button', { name: 'Create Custom' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Create Custom' })).not.toHaveFocus();

    await userEvent.click(screen.getByText('Boss Bat'));
    await userEvent.click(screen.getByTitle('Edit creature'));
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Creature' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Create Custom' })).not.toHaveFocus();
  });

  it('folds the row away as it opens a creature to edit, as before', async () => {
    await openCreatureLibrary();
    await userEvent.click(screen.getByText('Boss Bat'));
    await userEvent.click(screen.getByTitle('Edit creature'));

    expect(screen.getByRole('heading', { name: 'Edit Creature' })).toBeVisible();
    expect(screen.queryByTitle('Edit creature')).toBeNull();
  });
});

describe('Token Templates on a narrow screen', () => {
  beforeEach(() => screenIs('narrow'));

  it('opens New Template in place of the list, and Back to the list returns to New Template', async () => {
    await openTemplates();
    await userEvent.click(screen.getByRole('button', { name: 'New Template' }));

    const heading = screen.getByRole('heading', { name: 'New Token Template' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByPlaceholderText('Search templates...')).not.toBeVisible();
    expect(screen.getByText('Treasure Chest')).not.toBeVisible();
    expect(classes(screen.getByPlaceholderText('Search templates...').closest('[hidden]'))).toEqual(['hidden']);
    expect(within(headingRow('New Token Template')).queryByRole('button')).toBeNull();
    expect(classes(form('New Token Template'))).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']));
    expect(classes(form('New Token Template'))).not.toContain('max-h-[60vh]');

    await userEvent.click(screen.getByRole('button', { name: 'Back to the list' }));

    expect(screen.queryByRole('heading', { name: 'New Token Template' })).toBeNull();
    expect(screen.getByPlaceholderText('Search templates...')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'New Template' })).toHaveFocus());
  });

  it('edits a template as a step, and gives focus back to its Edit button once saved', async () => {
    await openTemplates();
    await userEvent.click(screen.getByText('Treasure Chest'));
    await userEvent.click(screen.getByTitle('Edit template'));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit Template' })).toHaveFocus());
    expect(screen.getByPlaceholderText('Search templates...')).not.toBeVisible();

    // Nothing changed, so the form closes without sending anything.
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Template' })).toBeNull());
    await waitFor(() => expect(screen.getByTitle('Edit template')).toHaveFocus());
  });
});

describe('Token Templates when the control that opened the form has gone', () => {
  it('gives focus to New Template after an Edit opened wide is left on a narrow screen', async () => {
    const turn = liveScreen('wide');
    await openTemplates();
    await userEvent.click(screen.getByText('Treasure Chest'));
    await userEvent.click(screen.getByTitle('Edit template'));
    turn('narrow');
    await userEvent.click(screen.getByRole('button', { name: 'Back to the list' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'New Template' })).toHaveFocus());
  });
});

describe('Token Templates on a wide screen', () => {
  beforeEach(() => screenIs('wide'));

  it('folds the row away as it opens a template to edit, as before', async () => {
    await openTemplates();
    await userEvent.click(screen.getByText('Treasure Chest'));
    await userEvent.click(screen.getByTitle('Edit template'));

    expect(screen.getByRole('heading', { name: 'Edit Template' })).toBeVisible();
    expect(screen.queryByTitle('Edit template')).toBeNull();
  });

  it("keeps the form its border, its height cap and its own X, which closes it", async () => {
    await openTemplates();
    await userEvent.click(screen.getByRole('button', { name: 'New Template' }));

    expect(classes(form('New Token Template'))).toEqual(expect.arrayContaining(['border-t', 'max-h-[60vh]', 'overflow-y-auto']));
    expect(classes(form('New Token Template'))).not.toContain('flex-1');
    await userEvent.click(within(headingRow('New Token Template')).getByRole('button'));
    expect(screen.queryByRole('heading', { name: 'New Token Template' })).toBeNull();
  });

  it('moves no focus as the form closes, on Cancel or a save', async () => {
    await openTemplates();
    await userEvent.click(screen.getByRole('button', { name: 'New Template' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'New Template' })).not.toHaveFocus();

    await userEvent.click(screen.getByText('Treasure Chest'));
    await userEvent.click(screen.getByTitle('Edit template'));
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit Template' })).toBeNull());
    expect(screen.getByRole('button', { name: 'New Template' })).not.toHaveFocus();
  });

  it('opens the form under the list, as before', async () => {
    await openTemplates();
    await userEvent.click(screen.getByRole('button', { name: 'New Template' }));

    const heading = screen.getByRole('heading', { name: 'New Token Template' });
    expect(heading).toBeVisible();
    expect(heading).not.toHaveFocus();
    expect(screen.getByText('Treasure Chest')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back to the list' })).toBeNull();
  });
});
