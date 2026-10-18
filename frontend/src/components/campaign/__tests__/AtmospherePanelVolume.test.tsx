/**
 * The ambient volume slider tells the table when it is let go, not at every
 * step of the drag.
 *
 * Each step sent the new volume to the server, which rewrote the campaign's
 * atmosphere settings and sent the change to every player, whose sound then
 * started a fresh fade. Dragging from silent to full was twenty of each.
 *
 * A browser fires `input` at each step and `change` when the value is
 * committed: a drag let go, a key pressed, or a value set by touch or a
 * screen reader. The volume is sent on `change`; it was sent on pointer-up
 * and key-up, which a screen reader setting the value fires neither of.
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

    for (const step of [0.55, 0.6, 0.65, 0.7, 0.75, 0.8]) fireEvent.input(slider, { target: { value: String(step) } });
    expect(emitAtmosphereAudioSet).not.toHaveBeenCalled();
    expect(screen.getByText('80%')).toBeTruthy();

    fireEvent.pointerUp(slider);
    fireEvent.change(slider);
    expect(emitAtmosphereAudioSet).toHaveBeenCalledTimes(1);
    expect(emitAtmosphereAudioSet).toHaveBeenCalledWith({ assetId: 'rain', volume: 0.8, loop: true });
  });

  it('sends the volume when a key moves it', () => {
    render(<AtmospherePanel isOpen onClose={() => {}} />);
    const slider = screen.getByTitle('Volume');

    fireEvent.input(slider, { target: { value: '0.45' } });
    fireEvent.change(slider);
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    expect(emitAtmosphereAudioSet).toHaveBeenCalledTimes(1);
    expect(emitAtmosphereAudioSet).toHaveBeenCalledWith({ assetId: 'rain', volume: 0.45, loop: true });
  });

  it('sends a volume set without a pointer or a key, as a screen reader sets it', () => {
    render(<AtmospherePanel isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByTitle('Volume'), { target: { value: '0.3' } });
    expect(emitAtmosphereAudioSet).toHaveBeenCalledTimes(1);
    expect(emitAtmosphereAudioSet).toHaveBeenCalledWith({ assetId: 'rain', volume: 0.3, loop: true });
  });
});
