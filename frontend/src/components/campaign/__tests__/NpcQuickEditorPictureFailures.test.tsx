/**
 * Edit Token says when a picture action fails.
 *
 * Loading the token pictures, uploading one, saving it to the creature and
 * making a custom copy of an SRD creature for it each wrote their failure to
 * the browser's console alone: the picker stayed empty, the upload button
 * came back, and nothing said why. Each now says so, with the server's
 * reason when there is one. A picture list that fails to load is covered
 * in NpcQuickEditorPictureSearch.test.tsx, as the picker grid loads it.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const showToast = vi.fn();

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    useReducedMotionConfig: () => false,
    useIsPresent: () => true,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { emitMapChange: vi.fn() } }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', memberships: [] }, currentMap: { id: 'map-1', feetPerSquare: 5 } }),
}));
const api = vi.hoisted(() => ({
  updateToken: vi.fn(), listAssets: vi.fn(), uploadAsset: vi.fn(), updateCreature: vi.fn(),
  getCreature: vi.fn(), listCreatures: vi.fn(), duplicateCreature: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

import NpcQuickEditor from '../NpcQuickEditor';

const goblin: Token = {
  id: 'goblin', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: { current: 7, max: 7, temp: 0 }, showHpBar: false, notes: '', initiative: null, obscured: false,
};

const refusal = (status: number, message: string) => ({ response: { status, data: { message } } });

function open(token: Token = goblin) {
  useGameStore.getState().setTokens([token]);
  render(<NpcQuickEditor token={token} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={() => {}} />);
}

beforeEach(() => {
  showToast.mockClear();
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
  useGameStore.getState().clearGameState();
});

it('says why an uploaded picture was refused', async () => {
  api.uploadAsset.mockRejectedValue(refusal(400, 'That file is not a PNG, JPEG, WebP or GIF picture'));
  const { container } = { container: document.body };
  open();
  fireEvent.click(screen.getByTitle('Add a token image'));
  await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'goblin.png', { type: 'image/png' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('That file is not a PNG, JPEG, WebP or GIF picture', 'error'));
});

const fromCreature: Token = { ...goblin, imageUrl: '/api/assets/tokens/goblin-art', creatureTemplateId: 'creature-1' };

it('says why the picture could not be saved to the creature', async () => {
  api.updateCreature.mockRejectedValue(refusal(400, 'imageUrl: Too big: expected string to have <=500 characters'));
  open(fromCreature);
  fireEvent.click(screen.getByTitle('Change token image'));
  fireEvent.click(await screen.findByRole('button', { name: 'Save image to creature template' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('imageUrl: Too big: expected string to have <=500 characters', 'error'));
});

it('says why a custom copy of an SRD creature could not be made', async () => {
  api.updateCreature.mockRejectedValue(refusal(403, 'Cannot edit SRD creatures. Duplicate it first to create a custom version.'));
  api.getCreature.mockResolvedValue({ id: 'creature-1', name: 'Goblin' });
  api.listCreatures.mockResolvedValue({ creatures: [], total: 0 });
  api.duplicateCreature.mockRejectedValue(refusal(400, 'The campaign has too many creatures'));
  open(fromCreature);
  fireEvent.click(screen.getByTitle('Change token image'));
  fireEvent.click(await screen.findByRole('button', { name: 'Save image to creature template' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Create & Save Image' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('The campaign has too many creatures', 'error'));
});
