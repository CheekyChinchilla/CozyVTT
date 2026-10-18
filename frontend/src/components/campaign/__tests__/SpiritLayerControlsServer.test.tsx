/**
 * The spirit layer panel shows what the server holds.
 *
 * Opening the veil marked the spirit realm open on the DM's page at once,
 * before the server had answered, so a refused switch (a dropped connection,
 * the flood ceiling) left the DM's page saying the players could cross while
 * they could not. A refused style change left the new style picked, though
 * the table kept the old one. The switch now waits for the server's
 * broadcast, and a refused style puts the picker back.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});

const updateCampaignSpiritLayer = vi.fn();
const veil = vi.hoisted(() => ({ open: false }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', spiritLayerEnabled: veil.open, spiritLayerStyle: 'wispy' },
    currentMap: { id: 'map-1' },
    updateCampaignSpiritLayer,
    dmViewBothPlanes: true,
    setDmViewBothPlanes: vi.fn(),
  }),
}));
const emitSpiritLayerToggle = vi.fn();
const emitSpiritLayerStyleChange = vi.fn();
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emitSpiritLayerToggle, emitSpiritLayerStyleChange, emitSpiritLayerTokenToggle: vi.fn() } }),
}));
const updateCampaign = vi.fn();
vi.mock('@/services/campaign.service', () => ({ default: { updateCampaign: (...a: unknown[]) => updateCampaign(...a) } }));

import SpiritLayerControls from '../SpiritLayerControls';

beforeEach(() => {
  vi.clearAllMocks();
  veil.open = false;
});

it('asks the server to open the veil and leaves the page as it is until the server says so', async () => {
  render(<SpiritLayerControls isOpen onClose={() => {}} />);
  await userEvent.click(screen.getByTitle('Open the veil'));

  expect(emitSpiritLayerToggle).toHaveBeenCalledWith({ visible: true });
  expect(updateCampaignSpiritLayer).not.toHaveBeenCalled();
  expect(screen.getByText('Spirit realm hidden from players')).toBeInTheDocument();
});

it('puts the style back when the server refuses it', async () => {
  updateCampaign.mockRejectedValue({ response: { status: 400, data: { message: 'Invalid spirit layer style' } } });
  render(<SpiritLayerControls isOpen onClose={() => {}} />);
  const shadow = screen.getByRole('button', { name: /Shadow/ });
  await userEvent.click(shadow);

  expect(await screen.findByText('Invalid spirit layer style')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: /Wispy/ })).toHaveAttribute('aria-pressed', 'true'));
  expect(shadow).toHaveAttribute('aria-pressed', 'false');
  expect(emitSpiritLayerStyleChange).not.toHaveBeenCalled();
});

// The save's answer put the veil back to how it was when the save began: a
// veil opened by the server meanwhile showed closed again on the DM's page.
it('keeps a veil opened while a style was being saved', async () => {
  let answer: () => void = () => {};
  updateCampaign.mockReturnValue(new Promise<void>((resolve) => { answer = resolve; }));
  const { rerender } = render(<SpiritLayerControls isOpen onClose={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Shadow/ }));

  veil.open = true;
  rerender(<SpiritLayerControls isOpen onClose={() => {}} />);
  await act(async () => { answer(); });
  expect(updateCampaignSpiritLayer).toHaveBeenLastCalledWith(true, 'shadow');
});
