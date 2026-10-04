import { readFileSync } from 'fs';
import path from 'path';
import {
  isHexColor,
  isSafeVibeFilter,
  isValidSpiritStyle,
  parseSpiritStyle,
  THEME_COLOR_PATTERN,
} from '../styleAllowlists';

describe('isHexColor', () => {
  it.each(['#000000', '#FFFFFF', '#7c3aed'])('accepts %s', (v) => expect(isHexColor(v)).toBe(true));
  it.each(['#fff', '#12345', '#1234567', 'red', 'url(x)', '#7c3aed '])('refuses %j', (v) => expect(isHexColor(v)).toBe(false));
});

describe('isSafeVibeFilter', () => {
  it.each([
    'none', '',
    'brightness(0.9) saturate(1.1)',
    'brightness(0.85) saturate(1.3) hue-rotate(10deg)',
    'brightness(0.6) saturate(0.7) contrast(1.1)',
    'hue-rotate(-15deg)', 'brightness(1.05)', '  contrast(1.10)  ',
  ])('accepts %j', (v) => expect(isSafeVibeFilter(v)).toBe(true));

  it.each([
    'url(https://evil.example/f.svg#x)',
    'brightness(1) url(x)',
    'blur(5px)',
    'brightness(1);background:url(x)',
    'expression(alert(1))',
    'brightness(1)saturate(1)',
    'hue-rotate(10)',
    'brightness(1) ' + 'saturate(1) '.repeat(30),
  ])('refuses %j', (v) => expect(isSafeVibeFilter(v)).toBe(false));
});

describe('spirit style', () => {
  it.each(['wispy', 'ethereal', 'shadow', 'dream', 'custom:#7c3aed', 'custom:#7C3AED:dream'])('accepts %s', (v) => {
    expect(isValidSpiritStyle(v)).toBe(true);
  });

  it.each(['', 'sparkly', 'custom:', 'custom:#abc:wispy', 'custom:url(x):wispy', 'custom:#7c3aed:sparkly', 'custom:#7c3aed:dream:extra', 'wispy '])(
    'refuses %j',
    (v) => expect(isValidSpiritStyle(v)).toBe(false),
  );

  it('parses a named look, a custom colour, and a custom colour with a look', () => {
    expect(parseSpiritStyle('shadow')).toEqual({ effect: 'shadow', customColor: null });
    expect(parseSpiritStyle('custom:#7c3aed')).toEqual({ effect: 'wispy', customColor: '#7c3aed' });
    expect(parseSpiritStyle('custom:#7c3aed:dream')).toEqual({ effect: 'dream', customColor: '#7c3aed' });
  });

  it('reads anything invalid as plain wispy with no colour', () => {
    for (const v of [null, undefined, '', 'custom:url(x):wispy', 'custom:#abc']) {
      expect(parseSpiritStyle(v)).toEqual({ effect: 'wispy', customColor: null });
    }
  });
});

describe('THEME_COLOR_PATTERN', () => {
  it.each(['', 'Classic Red', '#b91c1c'])('accepts %j', (v) => expect(THEME_COLOR_PATTERN.test(v)).toBe(true));
  it.each(['#abc', 'red; background: url(x)', '<b>'])('refuses %j', (v) => expect(THEME_COLOR_PATTERN.test(v)).toBe(false));
});

describe('parity with the frontend copy', () => {
  // The server decides what may be stored; the client decides what may be
  // rendered. If the two disagree, one of them is trusting the other.
  it('is byte-for-byte identical to frontend/src/utils/styleAllowlists.ts', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../styleAllowlists.ts'), 'utf8');
    const frontendCopy = readFileSync(path.resolve(__dirname, '../../../../frontend/src/utils/styleAllowlists.ts'), 'utf8');
    expect(backendCopy).toBe(frontendCopy);
  });
});
