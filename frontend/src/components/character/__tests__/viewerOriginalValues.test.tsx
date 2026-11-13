/**
 * The values a Horror d100 character held before its sheet was rebuilt are
 * shown to the character's owner and to the campaign's GM, and to nobody
 * else who can open the sheet.
 *
 * The server sends the record with the sheet to everyone who may read it, as
 * it sent the old sheet's values, so who is shown it is decided here.
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Campaign, Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';
import { horrorD100Character } from '../../character-sheets/horror-d100/__tests__/sheetFixture';

const viewer = { id: 'owner' };

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: viewer.id, platformRole: 'USER' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useOptionalWebSocket: () => null }));
vi.mock('@/services/api', () => ({ api: {} }));

const converted = {
  from: 1 as const,
  at: '2026-11-12T08:30:00.000Z',
  characteristics: { STR: 60, CHA: 45 },
  luck: 35,
  skills: [{ name: 'Charm', value: 45 }],
  kept: [],
};

const character = (sheet: Parameters<typeof horrorD100Character>[0] = { converted }): Character =>
  horrorD100Character(sheet, { userId: 'owner', campaignId: 'camp-1' });

const membership = (role: string) => ({ userId: viewer.id, campaignId: 'camp-1', role, characterIds: [] }) as unknown as CampaignMembership;

function openStory(props: { membership?: CampaignMembership; campaign?: Campaign }, sheet = character()) {
  render(<CharacterSheetViewerModal character={sheet} campaignId="camp-1" onClose={() => {}} {...props} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
}

beforeEach(() => {
  viewer.id = 'owner';
});

it('are shown to the character\'s owner, at the table and from the Characters page', () => {
  openStory({ membership: membership('PLAYER') });
  const panel = screen.getByRole('region', { name: 'Original values' });
  expect(panel).toHaveTextContent('STR60');
  expect(panel).toHaveTextContent('Luck35');
  expect(panel).toHaveTextContent('Charm45%');
});

it('are shown to the owner with no campaign around the sheet', () => {
  openStory({});
  expect(screen.getByRole('region', { name: 'Original values' })).toBeInTheDocument();
});

it('are shown to the owner who watches the campaign as a spectator', () => {
  openStory({ membership: membership('SPECTATOR') });
  expect(screen.getByRole('region', { name: 'Original values' })).toBeInTheDocument();
});

it('are shown to the campaign\'s GM', () => {
  viewer.id = 'the-gm';
  openStory({ membership: membership('GM') });
  expect(screen.getByRole('region', { name: 'Original values' })).toBeInTheDocument();
});

it('are shown to the GM where the page knows the role from the campaign', () => {
  viewer.id = 'the-gm';
  openStory({ campaign: { id: 'camp-1', userRole: 'GM' } as unknown as Campaign });
  expect(screen.getByRole('region', { name: 'Original values' })).toBeInTheDocument();
});

it.each(['PLAYER', 'SPECTATOR'])('are not shown to another %s of the campaign', (role) => {
  viewer.id = 'someone-else';
  openStory({ membership: membership(role) });
  expect(screen.queryByRole('region', { name: 'Original values' })).toBeNull();
  expect(screen.queryByText('Original values')).toBeNull();
});

it('are absent for a sheet that was never converted, whoever reads it', () => {
  openStory({ membership: membership('PLAYER') }, character({}));
  expect(screen.queryByText('Original values')).toBeNull();
});
