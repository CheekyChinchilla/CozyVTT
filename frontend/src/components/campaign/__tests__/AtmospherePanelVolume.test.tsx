/**
 * The ambient volume slider tells the table when it is let go, not at every
 * step of the drag.
 *
 * Each step sent the new volume to the server, which rewrote the campaign's
 * atmosphere settings and sent the change to every player, whose sound then
 * started a fresh fade. Dragging from silent to full was twenty of each.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const emitAtmosphereAudioSet = vi.fn();

// One object, as the real context holds: the panel takes its volume from
// the playing track whenever that changes.
const playing = {
  campaign: { id: 'c1', name: 'The Table' },
  activeAtmosphereEffect: null,
  activeAtmosphereAudio: { assetId: 'rain', volume: 0.5, loop: true },
};
vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => playing }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emitAtmosphereAudioSet, emitAtmosphereEffectSet: vi.fn() }, isConnected: true }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }),
}));
vi.mock('@/services/api', () => {
  const client = { listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: { page: 1, limit: 25, total: 0 } }) };
  return { api: client, default: client };
});

import AtmospherePanel from '../AtmospherePanel';

beforeEach(() => {
  emitAtmosphereAudioSet.mockClear();
});

describe('the ambient volume slider', () => {
  it('sends the volume once, where it was let go', () => {
    render(<AtmospherePanel isOpen onClose={() => {}} />);
    const slider = screen.getByTitle('Volume');

    for (const step of [0.55, 0.6, 0.65, 0.7, 0.75, 0.8]) fireEvent.change(slider, { target: { value: String(step) } });
    expect(emitAtmosphereAudioSet).not.toHaveBeenCalled();
    expect(screen.getByText('80%')).toBeTruthy();

    fireEvent.pointerUp(slider);
    expect(emitAtmosphereAudioSet).toHaveBeenCalledTimes(1);
    expect(emitAtmosphereAudioSet).toHaveBeenCalledWith({ assetId: 'rain', volume: 0.8, loop: true });
  });

  it('sends the volume when a key moves it', () => {
    render(<AtmospherePanel isOpen onClose={() => {}} />);
    const slider = screen.getByTitle('Volume');

    fireEvent.change(slider, { target: { value: '0.45' } });
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    expect(emitAtmosphereAudioSet).toHaveBeenCalledTimes(1);
    expect(emitAtmosphereAudioSet).toHaveBeenCalledWith({ assetId: 'rain', volume: 0.45, loop: true });
  });
});
