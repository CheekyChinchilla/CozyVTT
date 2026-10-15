import { describe, it, expect } from 'vitest';
import { refusedSaveMessage, REFUSED_BOXES_NAMED } from '../sheetSaveRefusal';

const issue = (path: string, message = 'Too long') => ({ path, message });

describe('refusedSaveMessage', () => {
  it('names a single box with its reason', () => {
    expect(refusedSaveMessage([issue('backstory', 'Can be at most 100,000 characters')], 'schema', 'x')).toBe(
      'Not saved. backstory: Can be at most 100,000 characters'
    );
  });

  it('names all of the boxes up to the limit, separated by semicolons', () => {
    const issues = Array.from({ length: REFUSED_BOXES_NAMED }, (_unused, i) => issue(`box${i}`));
    const text = refusedSaveMessage(issues, 'schema', 'x');
    expect(text.split('; ')).toHaveLength(REFUSED_BOXES_NAMED);
    expect(text).not.toContain('more');
  });

  it('counts the boxes past the limit', () => {
    const issues = Array.from({ length: REFUSED_BOXES_NAMED + 2 }, (_unused, i) => issue(`box${i}`));
    expect(refusedSaveMessage(issues, 'schema', 'x')).toMatch(/ and 2 more\.$/);
  });

  it('uses the server message, then the fallback, when no box was named', () => {
    expect(refusedSaveMessage([], 'Sheet refused', 'x')).toBe('Sheet refused');
    expect(refusedSaveMessage([], undefined, 'Failed to save')).toBe('Failed to save');
  });
});
