/**
 * The ambient audio player is emptied without pointing it at the page.
 *
 * Stopping, and the player's first moment on the campaign page with nothing
 * playing, set the audio element's address to an empty string, which a
 * browser reads as the page's own address and tries to play: Firefox logged
 * "Invalid URI. Load of media resource failed" on every campaign page load.
 * The address is now removed instead.
 */

import { it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

class RecordingAudio {
  loop = true;
  volume = 0;
  assigned: string[] = [];
  removed = 0;
  private current = '';
  get src() { return this.current; }
  set src(value: string) { this.assigned.push(value); this.current = value; }
  removeAttribute(name: string) { if (name === 'src') { this.removed += 1; this.current = ''; } }
  addEventListener() {}
  removeEventListener() {}
  pause() {}
  load() {}
  play() { return Promise.resolve(); }
}
const created: RecordingAudio[] = [];
vi.stubGlobal('Audio', class extends RecordingAudio { constructor() { super(); created.push(this); } });

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'c1', vibeSettings: {} }, userRole: 'PLAYER', currentVibe: null,
    activeAtmosphereAudio: null, updateAtmosphereAudio: vi.fn(), updateAtmosphereEffect: vi.fn(),
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { onAtmosphereAudioUpdated: vi.fn(), onAtmosphereEffectUpdated: vi.fn(), off: vi.fn(), emitAtmosphereAudioSet: vi.fn() } }),
}));

import AtmospherePlayer from '../AtmospherePlayer';

it('never sets an empty address, on the page or when it leaves', () => {
  const { unmount } = render(<AtmospherePlayer />);
  unmount();

  const audio = created[created.length - 1];
  expect(audio.assigned).not.toContain('');
  expect(audio.removed).toBeGreaterThan(0);
});
