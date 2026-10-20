/**
 * The colours the map draws tokens in, and the rule that picks one.
 *
 * The map's colours were hex literals; they are channels now, written once.
 * These hold them to the colours the map has always drawn, since a test that
 * compares the map with the same constants would pass whatever they were.
 */
import { describe, it, expect } from 'vitest';
import { TOKEN_HUES, HP_HUES, TEMP_HP_FILL, hpTier, tokenKind, tokenPlaceholder } from '../tokenColours';

const hex = (channels: string) => `#${channels.split(' ').map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`;

describe('the token colours', () => {
  it('are the colours the map has always drawn', () => {
    expect(Object.fromEntries(Object.entries(TOKEN_HUES).map(([k, v]) => [k, hex(v)]))).toEqual({
      player: '#3b82f6', hostile: '#ef4444', friendly: '#2dd4bf', neutral: '#fbbf24', object: '#78716c',
    });
    expect(Object.fromEntries(Object.entries(HP_HUES).map(([k, v]) => [k, hex(v)]))).toEqual({
      full: '#22c55e', good: '#84cc16', low: '#f59e0b', critical: '#ef4444',
    });
    expect(TEMP_HP_FILL).toBe('rgba(147, 197, 253, 0.75)');
  });

  it('put exactly half in good and a quarter in low', () => {
    expect([1, 0.75, 0.5, 0.49, 0.25, 0.24, 0].map(hpTier)).toEqual(['full', 'full', 'good', 'low', 'low', 'critical', 'critical']);
  });
});

describe('which colour a token is', () => {
  it('is blue for a player, its disposition otherwise, and stone with neither', () => {
    expect(tokenKind('player', 'hostile')).toBe('player');
    expect(tokenKind('npc', 'hostile')).toBe('hostile');
    expect(tokenKind('npc', 'friendly')).toBe('friendly');
    expect(tokenKind('object', 'neutral')).toBe('neutral');
    expect(tokenKind('npc', null)).toBe('object');
    expect(tokenKind('object', undefined)).toBe('object');
  });

  it('gives a picture-less creature or template the same colour as its letter circle', () => {
    expect(tokenPlaceholder('player', null)).toContain('bg-token-player');
    expect(tokenPlaceholder('object', null)).toContain('bg-token-object');
    expect(tokenPlaceholder('npc', 'friendly')).toContain('bg-token-friendly');
  });
});
