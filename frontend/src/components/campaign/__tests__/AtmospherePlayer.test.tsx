/**
 * Who answers when a non-looping track finishes.
 *
 * The DM's client re-asserts the current vibe's track, so a one-shot sound
 * effect does not leave the table silent until the next vibe switch, and with
 * a track-less vibe it clears the finished track from the stored state so a
 * late joiner does not start it from the top. A player's client answers
 * nothing: everyone's copy of the track ended on its own.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { Campaign, CampaignRole } from '@/types';

const TRACK = '11111111-1111-4111-8111-111111111111';

class FakeAudio {
  loop = true;
  volume = 0;
  src = '';
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, cb: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: () => void) {
    this.listeners.get(type)?.delete(cb);
  }
  dispatch(type: string) {
    for (const cb of this.listeners.get(type) ?? []) cb();
  }
  pause() {}
  load() {}
  play() {
    return Promise.resolve();
  }
}

let lastAudio: FakeAudio | null = null;
vi.stubGlobal(
  'Audio',
  class extends FakeAudio {
    constructor() {
      super();
      lastAudio = this;
    }
  },
);

const mockState: {
  campaign: Partial<Campaign>;
  userRole: CampaignRole;
  currentVibe: string | null;
} = { campaign: {}, userRole: 'DM' as CampaignRole, currentVibe: null };

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: mockState.campaign,
    userRole: mockState.userRole,
    currentVibe: mockState.currentVibe,
    activeAtmosphereAudio: { assetId: 'one-shot', audioUrl: '/api/assets/audio/one-shot', volume: 0.7, loop: false },
    updateAtmosphereAudio: vi.fn(),
    updateAtmosphereEffect: vi.fn(),
  }),
}));

const emitAtmosphereAudioSet = vi.fn();
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: {
      emitAtmosphereAudioSet,
      onAtmosphereAudioUpdated: vi.fn(),
      onAtmosphereEffectUpdated: vi.fn(),
      off: vi.fn(),
    },
  }),
}));

import AtmospherePlayer from '../AtmospherePlayer';

describe('AtmospherePlayer after a track ends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastAudio = null;
    mockState.campaign = {
      id: 'c1',
      vibeSettings: {
        enabled: true,
        periods: [{ name: 'battle', hue: '#FF9966', filter: 'none', audio: TRACK }],
      },
    };
    mockState.userRole = 'DM' as CampaignRole;
    mockState.currentVibe = 'battle';
  });

  it("the DM's client re-asserts the vibe's track", () => {
    render(<AtmospherePlayer />);
    lastAudio!.dispatch('ended');
    expect(emitAtmosphereAudioSet).toHaveBeenCalledWith({ assetId: TRACK, volume: 0.7, loop: true });
  });

  it('with a track-less vibe the DM clears the finished track', () => {
    mockState.currentVibe = null;
    render(<AtmospherePlayer />);
    lastAudio!.dispatch('ended');
    expect(emitAtmosphereAudioSet).toHaveBeenCalledWith({ assetId: null, volume: 0.7, loop: true });
  });

  it("a player's client answers nothing", () => {
    mockState.userRole = 'PLAYER' as CampaignRole;
    render(<AtmospherePlayer />);
    lastAudio!.dispatch('ended');
    expect(emitAtmosphereAudioSet).not.toHaveBeenCalled();
  });
});
