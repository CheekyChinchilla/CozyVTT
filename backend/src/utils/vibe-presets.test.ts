/**
 * The rule that keeps the atmosphere track out of a settings write.
 *
 * Three places write `Campaign.vibeSettings`: the two campaign settings routes
 * and campaign import. None of them can check whether the caller may read the
 * asset an `atmosphereAudio` names, so none of them may set one. They all go
 * through this helper instead.
 */

import { preserveAtmosphereAudio, validateVibeSettings, DEFAULT_VIBE_SETTINGS } from './vibe-presets';

const settings = (extra: Record<string, unknown> = {}) => ({
  enabled: true,
  periods: [{ name: 'Day', hue: '#FF9966', filter: 'none', audio: null }],
  ...extra,
});

const audioOf = (value: unknown): unknown =>
  (value as Record<string, unknown>).atmosphereAudio;

describe('DEFAULT_VIBE_SETTINGS', () => {
  it('passes the check every writer applies, so a new or imported campaign starts valid', () => {
    expect(validateVibeSettings(DEFAULT_VIBE_SETTINGS)).toBeNull();
  });
});

describe('preserveAtmosphereAudio', () => {
  it('drops an atmosphereAudio the caller sent', () => {
    const result = preserveAtmosphereAudio(
      settings({ atmosphereAudio: { assetId: 'someone-elses-file' } }),
      settings()
    );
    expect(result).not.toHaveProperty('atmosphereAudio');
  });

  it('keeps the one already stored', () => {
    const stored = settings({ atmosphereAudio: { assetId: 'playing-now', volume: 0.5 } });
    const result = preserveAtmosphereAudio(
      settings({ atmosphereAudio: { assetId: 'someone-elses-file' } }),
      stored
    );
    expect(audioOf(result)).toEqual({ assetId: 'playing-now', volume: 0.5 });
  });

  it('keeps a stored null, which is how a track is cleared', () => {
    const result = preserveAtmosphereAudio(settings(), settings({ atmosphereAudio: null }));
    expect(audioOf(result)).toBeNull();
  });

  it('leaves the rest of the settings alone', () => {
    const result = preserveAtmosphereAudio(settings({ enabled: false }), settings());
    expect(result).toMatchObject({
      enabled: false,
      periods: [{ name: 'Day', hue: '#FF9966', filter: 'none', audio: null }],
    });
  });

  it('sets nothing on an import, which has no stored settings', () => {
    const result = preserveAtmosphereAudio(
      settings({ atmosphereAudio: { assetId: 'from-the-archive' } })
    );
    expect(result).not.toHaveProperty('atmosphereAudio');
  });

  it('passes through anything that is not an object, for the validator to refuse', () => {
    expect(preserveAtmosphereAudio(null)).toBeNull();
    expect(preserveAtmosphereAudio('nope')).toBe('nope');
    expect(preserveAtmosphereAudio([1, 2])).toEqual([1, 2]);
  });
});

describe('validateVibeSettings filter allowlist', () => {
  const withFilter = (filter: string) => ({
    enabled: true,
    periods: [{ name: 'Day', hue: '#FF9966', filter, audio: null }],
  });

  it.each([
    'none',
    '',
    'brightness(0.9) saturate(1.1)',
    'brightness(0.85) saturate(1.3) hue-rotate(10deg)',
    'brightness(0.6) saturate(0.7) contrast(1.1)',
    'hue-rotate(-15deg)',
    'brightness(1.05)',
  ])('accepts the filter %j, as the presets and the editor produce it', (filter) => {
    expect(validateVibeSettings(withFilter(filter))).toBeNull();
  });

  it.each([
    'url(https://evil.example/f.svg#x)',
    'brightness(1) url(x)',
    'blur(5px)',
    'brightness(1);background:url(x)',
    'expression(alert(1))',
  ])('refuses the filter %j', (filter) => {
    expect(validateVibeSettings(withFilter(filter))).toMatch(/filter/);
  });
});
