/**
 * Editing Features & Traits on the D&D 5e sheet.
 *
 * The reported bug: "Add Feature" did nothing. The button appended a blank row
 * to the sheet, but the rows were *derived* from the sheet through the shared
 * reader — and that reader drops entries with no name, which is right for
 * storage and wrong for an editor, because a row you are about to type into is
 * nameless by definition. So the new row was discarded on the same render that
 * created it and the button looked dead.
 *
 * These drive the real editor: click the button, expect a row to type into.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import type { Character } from '../../../../types';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

/** The 18 skills, all unproficient. */
function blankSkills(): Record<string, { proficient: boolean; expertise: boolean; bonus: number }> {
  const keys = [
    'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history',
    'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
    'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival',
  ];
  return Object.fromEntries(keys.map((k) => [k, { proficient: false, expertise: false, bonus: 0 }]));
}

const ability = { score: 10, modifier: 0 };

function characterWith(sheet: Record<string, unknown>): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Nakudama',
    gameSystem: 'DND_5E',
    campaignId: null,
    tokenImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: {
      characterName: 'Nakudama',
      class: 'Fighter',
      level: 1,
      race: 'Human',
      proficiencyBonus: 2,
      stats: {
        strength: ability, dexterity: ability, constitution: ability,
        intelligence: ability, wisdom: ability, charisma: ability,
      },
      skills: blankSkills(),
      ...sheet,
    },
  } as unknown as Character;
}

/** Open the editor on its Features tab. */
function renderFeaturesTab(sheet: Record<string, unknown>) {
  const result = render(
    <DnD5eCharacterEditor
      character={characterWith(sheet)}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onCancel={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Features' }));
  return result;
}

/** Every feature-name box currently on screen, in order. */
function featureNames(): string[] {
  return screen
    .getAllByLabelText(/^Feature \d+ name$/)
    .map((input) => (input as HTMLInputElement).value);
}

describe('Add Feature', () => {
  it('adds an empty row to type into', () => {
    renderFeaturesTab({ featuresAndTraits: ['NakuDama-Amphibious'] });

    expect(featureNames()).toEqual(['NakuDama-Amphibious']);

    fireEvent.click(screen.getByRole('button', { name: '+ Add Feature' }));

    expect(featureNames()).toEqual(['NakuDama-Amphibious', '']);
  });

  it('adds a row to a sheet that has no features at all', () => {
    renderFeaturesTab({});

    expect(screen.getByText('No features added yet')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '+ Add Feature' }));

    expect(featureNames()).toEqual(['']);
  });

  it('adds several rows in a row', () => {
    renderFeaturesTab({});
    const add = screen.getByRole('button', { name: '+ Add Feature' });

    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(add);

    expect(featureNames()).toEqual(['', '', '']);
  });

  it('keeps the row while a name is typed into it', () => {
    renderFeaturesTab({});
    fireEvent.click(screen.getByRole('button', { name: '+ Add Feature' }));

    const input = screen.getByLabelText('Feature 1 name');
    fireEvent.change(input, { target: { value: 'NakuDama-Frog Leap' } });

    expect(featureNames()).toEqual(['NakuDama-Frog Leap']);
  });

  it('lets a description be typed on a row whose name is still blank', () => {
    // The description box is on the same row, so it has to survive too.
    renderFeaturesTab({});
    fireEvent.click(screen.getByRole('button', { name: '+ Add Feature' }));

    const description = screen.getByLabelText('Feature 1 description');
    fireEvent.change(description, { target: { value: 'Typed before the name.' } });

    expect((description as HTMLTextAreaElement).value).toBe('Typed before the name.');
  });
});

describe('removing a feature', () => {
  it('removes the row that was clicked', () => {
    renderFeaturesTab({ featuresAndTraits: ['First', 'Second', 'Third'] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Second' }));

    expect(featureNames()).toEqual(['First', 'Third']);
  });

  it('does not bring back a template feature that was removed', () => {
    // The template's copy lives in the separate `features` field. If the editor
    // re-read that on every render, deleting the row would be undone instantly.
    renderFeaturesTab({
      featuresAndTraits: ['Mine'],
      features: [{ name: 'Second Wind', description: 'Regain 1d10.' }],
    });

    expect(featureNames()).toEqual(['Mine', 'Second Wind']);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Second Wind' }));

    expect(featureNames()).toEqual(['Mine']);
  });
});

describe('what the editor starts with', () => {
  it('shows a hand-typed list unchanged', () => {
    renderFeaturesTab({
      featuresAndTraits: [
        'NakuDama-Amphibious',
        'NakuDama-Prehensile Tongue',
        'Aspiring Shadow Warrior',
      ],
    });

    expect(featureNames()).toEqual([
      'NakuDama-Amphibious',
      'NakuDama-Prehensile Tongue',
      'Aspiring Shadow Warrior',
    ]);
  });

  it('surfaces template features that were stored but never shown', () => {
    renderFeaturesTab({
      features: [{ name: 'Second Wind', description: 'Regain 1d10 + fighter level.' }],
    });

    expect(featureNames()).toEqual(['Second Wind']);
    expect((screen.getByLabelText('Feature 1 description') as HTMLTextAreaElement).value).toBe(
      'Regain 1d10 + fighter level.'
    );
  });
});
