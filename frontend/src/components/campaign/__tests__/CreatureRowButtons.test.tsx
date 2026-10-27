/**
 * A Creature Library row is a button that opens it, with the favourite star
 * beside it as a button of its own.
 *
 * The star sat inside the row's button. A button inside a button is not valid
 * HTML: React warned about it in the console, and a screen reader read the
 * row and the star as one control. The row's button also did not say whether
 * the row was open.
 *
 * The star, and the creature form's button that removes a trait or an
 * action, showed only an icon; they are named as their tooltips are.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreatureTemplate } from '@/types';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: null }, currentMap: null }),
}));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  listCreatures: vi.fn(),
  getSeedStatus: vi.fn(),
  listCreatureFavorites: vi.fn(),
  toggleCreatureFavorite: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));

import CreatureLibrary from '../CreatureLibrary';

const bat = {
  id: 'c1', name: 'Boss Bat', source: 'custom', challengeRating: '1', imageUrl: null,
  statBlock: { ac: 12, speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } },
  size: { width: 1, height: 1 }, disposition: 'hostile', displayMode: 'pog', campaignId: 'campaign-1',
} as unknown as CreatureTemplate;

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreatures.mockResolvedValue({ creatures: [bat], total: 1 });
  api.getSeedStatus.mockResolvedValue({ srdCount: 0 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.toggleCreatureFavorite.mockResolvedValue({ favorited: true });
});

/** The row's own button, open or not; Delete Boss Bat is another. */
const row = (expanded: boolean) => screen.getByRole('button', { name: /Boss Bat/, expanded });

it('puts no button inside another', async () => {
  const { container } = render(<CreatureLibrary isOpen onClose={() => {}} />);
  await screen.findByText('Boss Bat');
  expect(container.ownerDocument.querySelectorAll('button button')).toHaveLength(0);
});

it('says whether the row is open', async () => {
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await screen.findByText('Boss Bat');
  await userEvent.click(row(false));
  expect(row(true)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Duplicate/ })).toBeInTheDocument();
});

it('adds a favourite from the star without opening the row', async () => {
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await screen.findByText('Boss Bat');
  await userEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
  await waitFor(() => expect(api.toggleCreatureFavorite).toHaveBeenCalledWith('campaign-1', 'c1'));
  // It is now listed under Favorites as well; neither row is open.
  const rows = await screen.findAllByRole('button', { name: /Boss Bat/ });
  expect(rows).toHaveLength(2);
  for (const each of rows) expect(each).toHaveAttribute('aria-expanded', 'false');
});

// The star failed silently: a refused favourite simply did not change.
it('says why a favourite could not be changed', async () => {
  api.toggleCreatureFavorite.mockRejectedValue({ response: { status: 429, data: { message: 'Too many requests, please slow down' } } });
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await screen.findByText('Boss Bat');
  await userEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
  expect(await screen.findByText('Too many requests, please slow down')).toBeInTheDocument();
});

it('names the star as its tooltip does', async () => {
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await screen.findByText('Boss Bat');
  expect(screen.getByTitle('Add to favorites')).toHaveAttribute('aria-label', 'Add to favorites');
});

it("names the form's button that removes a trait", async () => {
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await screen.findByText('Boss Bat');
  await userEvent.click(screen.getByRole('button', { name: /Create Custom/ }));
  await userEvent.click(screen.getByRole('button', { name: /Advanced Stats/ }));
  const traits = screen.getByText('Traits', { selector: 'label' }).parentElement!;
  await userEvent.click(within(traits).getByRole('button', { name: /Add/ }));

  expect(screen.getByTitle('Remove')).toHaveAttribute('aria-label', 'Remove');
});
