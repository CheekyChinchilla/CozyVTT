/**
 * The notes under an editor's portrait.
 *
 * From `sm` up the refused-picture message and "Saves as personal token"
 * were each placed on their own at the foot of the portrait, so with both
 * showing (a refused picture on a character in no campaign) one was drawn
 * over the other. The D&D 5e, Pathfinder 2e, Call of Cthulhu and Flexible
 * editors now draw one box under the portrait holding both, one under the
 * other.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PortraitNotes from '../PortraitNotes';

const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);

describe('the notes under a portrait', () => {
  it('stand one under the other in one box placed under the portrait', () => {
    render(<PortraitNotes error="That picture is not a token picture." personal errorClassName="text-danger-ink" noteClassName="text-warning-ink" />);
    const error = screen.getByText('That picture is not a token picture.');
    const note = screen.getByText('Saves as personal token');
    const box = error.parentElement!;
    expect(note.parentElement).toBe(box);
    expect(classes(box)).toEqual(expect.arrayContaining(['sm:absolute', 'sm:top-full']));
    for (const line of [error, note]) expect(classes(line)).not.toContain('sm:absolute');
    expect(classes(error)).toContain('text-danger-ink');
    expect(classes(note)).toContain('text-warning-ink');
  });

  it('draws nothing with neither', () => {
    const { container } = render(<PortraitNotes error={null} personal={false} errorClassName="" noteClassName="" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the four editors', () => {
  const SOURCES = import.meta.glob([
    '/src/components/character-sheets/dnd5e/DnD5eCharacterEditor.tsx',
    '/src/components/character-sheets/pathfinder2e/Pathfinder2eCharacterEditor.tsx',
    '/src/components/character-sheets/call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor.tsx',
    '/src/components/character-sheets/flexible/FlexibleCharacterSheetEdit.tsx',
  ], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  it('draw their notes with PortraitNotes, and place none on its own', () => {
    expect(Object.keys(SOURCES)).toHaveLength(4);
    for (const source of Object.values(SOURCES)) {
      expect(source).toContain('<PortraitNotes');
      expect(source).not.toMatch(/sm:absolute sm:top-full sm:whitespace-nowrap/);
    }
  });
});
