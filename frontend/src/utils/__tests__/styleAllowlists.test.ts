import { describe, it, expect } from 'vitest';
import { isHexColor, isSafeVibeFilter, parseSpiritStyle } from '../styleAllowlists';

// The full behaviour is pinned in the backend copy's suite, which also checks
// the two files are identical. This covers what the map and the sheets use.
describe('styleAllowlists (frontend copy)', () => {
  it('re-checks a filter before it reaches the map', () => {
    expect(isSafeVibeFilter('brightness(0.9) saturate(1.1)')).toBe(true);
    expect(isSafeVibeFilter('url(https://evil.example/f.svg#x)')).toBe(false);
  });

  it('re-checks a hex colour before it reaches a gradient', () => {
    expect(isHexColor('#b91c1c')).toBe(true);
    expect(isHexColor('red; background: url(x)')).toBe(false);
  });

  it('reads an invalid spirit style as plain wispy', () => {
    expect(parseSpiritStyle('custom:url(x):wispy')).toEqual({ effect: 'wispy', customColor: null });
    expect(parseSpiritStyle('custom:#7c3aed:dream')).toEqual({ effect: 'dream', customColor: '#7c3aed' });
  });
});
