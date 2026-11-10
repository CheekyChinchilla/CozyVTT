/**
 * A Pathfinder 2e sheet that records no Class DC.
 *
 * Class DC is 10 plus the proficiency bonus for it plus the modifier of the
 * key attribute the class names. With nothing stored the editor filled in
 * Intelligence and showed 10 plus its modifier while the read-only sheet
 * showed 10, and the first save stored Intelligence for every class.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Pathfinder2eCharacterView } from '../Pathfinder2eCharacterView';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { Character, CharacterData } from '../../../../types';
import { pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

/** Brannoc, level 1, Strength +4 and Intelligence +3, with no Class DC stored. */
function withoutClassDC(): Character {
  const character = pf2eCharacter({
    characterName: 'Brannoc',
    attributes: {
      strength: { score: 18, modifier: 4 },
      dexterity: { score: 12, modifier: 1 },
      constitution: { score: 14, modifier: 2 },
      intelligence: { score: 16, modifier: 3 },
      wisdom: { score: 10, modifier: 0 },
      charisma: { score: 8, modifier: -1 },
    },
  });
  const data = { ...(character.data as unknown as Record<string, unknown>) };
  delete data.classDC;
  return { ...character, data: data as unknown as CharacterData };
}

/** The big number in the Class DC box. */
function classDCShown(): string | null | undefined {
  const box = screen.getByRole('heading', { name: 'Class DC' }).parentElement;
  return box?.querySelector('.text-4xl')?.textContent;
}

function openEditor(onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined)) {
  render(<Pathfinder2eCharacterEditor character={withoutClassDC()} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
  return onSave;
}

async function save(onSave: ReturnType<typeof openEditor>): Promise<Record<string, unknown>> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as Record<string, unknown>;
}

describe('a Pathfinder 2e sheet with no Class DC', () => {
  it('shows the same Class DC in the editor as on the sheet', () => {
    const { unmount } = render(<Pathfinder2eCharacterView character={withoutClassDC()} />);
    const onSheet = classDCShown();
    unmount();

    openEditor();
    expect(onSheet).toBe('10');
    expect(classDCShown()).toBe(onSheet);
  });

  it('chooses no key attribute for the player', () => {
    openEditor();
    expect(screen.getByLabelText('Key Attribute')).toHaveValue('');
  });

  it('saves no Class DC until a key attribute is chosen', async () => {
    const saved = await save(openEditor());
    // What the request carries: a key left undefined is not sent.
    expect(JSON.parse(JSON.stringify(saved))).not.toHaveProperty('classDC');
  });

  it('saves the whole Class DC once a key attribute is chosen', async () => {
    const onSave = openEditor();
    fireEvent.change(screen.getByLabelText('Key Attribute'), { target: { value: 'strength' } });
    fireEvent.change(screen.getByLabelText('Proficiency in Class DC'), { target: { value: 'trained' } });

    // 10 + trained 3 at level 1 + Strength 4.
    expect(classDCShown()).toBe('17');
    const saved = await save(onSave);
    expect(saved.classDC).toEqual({ keyAttribute: 'strength', proficiencyRank: 'trained', total: 17 });
  });

  it('waits for the key attribute before taking a proficiency rank', () => {
    openEditor();
    const rank = screen.getByLabelText('Proficiency in Class DC');
    expect(rank).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Key Attribute'), { target: { value: 'charisma' } });
    expect(rank).toBeEnabled();
    expect(within(rank).getByRole('option', { name: 'Untrained' })).toHaveProperty('selected', true);
  });
});
