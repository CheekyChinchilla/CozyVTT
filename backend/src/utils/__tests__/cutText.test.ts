/**
 * Text cut to a length in UTF-16 units, as JavaScript and the length limits
 * count it, never splitting a character that takes two units: half of one
 * cannot be stored, and is saved as U+FFFD.
 */

import { cutText } from '../cutText';

describe('cutText', () => {
  it('leaves text that fits alone', () => {
    expect(cutText('short', 10)).toBe('short');
    expect(cutText('exact', 5)).toBe('exact');
  });

  it('cuts text to the length', () => {
    expect(cutText('abcdef', 3)).toBe('abc');
  });

  it('drops a two-unit character the cut would split', () => {
    expect(cutText('ab\u{1F409}cd', 3)).toBe('ab');
    expect(cutText('ab\u{1F409}cd', 4)).toBe('ab\u{1F409}');
  });

  it('gives nothing for a length of zero or less', () => {
    expect(cutText('abc', 0)).toBe('');
    expect(cutText('abc', -2)).toBe('');
  });
});
