/**
 * The custom header colour on each editable sheet.
 *
 * The server accepts a preset name or a six-digit `#rrggbb` colour. The hex box
 * let anything from `#` to six digits through, so `#fff`, a colour any browser
 * understands, was sent as typed and the whole save was refused. A stored
 * three-digit colour also opened as the default preset and was saved over.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../dnd5e/DnD5eCharacterEditor';
import { Pathfinder2eCharacterEditor } from '../pathfinder2e/Pathfinder2eCharacterEditor';
import { CallOfCthulhu7eCharacterEditor } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';
import type { Character, CharacterData } from '../../../types';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const ability = { score: 10, modifier: 0 };

function dndCharacter(overrides: Record<string, unknown> = {}): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Aldra',
    gameSystem: 'DND_5E',
    campaignId: null,
    tokenImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: {
      characterName: 'Aldra',
      class: 'Fighter',
      level: 1,
      race: 'Human',
      proficiencyBonus: 2,
      stats: {
        strength: ability, dexterity: ability, constitution: ability,
        intelligence: ability, wisdom: ability, charisma: ability,
      },
      ...overrides,
    },
  } as unknown as Character;
}

type EditorProps = {
  character: Character;
  onSave: (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;
  onCancel: () => void;
};

const EDITORS: { system: string; Editor: React.FC<EditorProps>; character: (o?: Record<string, unknown>) => Character }[] = [
  { system: 'D&D 5e', Editor: DnD5eCharacterEditor, character: dndCharacter },
  { system: 'Pathfinder 2e', Editor: Pathfinder2eCharacterEditor, character: pf2eCharacter },
  { system: 'Call of Cthulhu 7e', Editor: CallOfCthulhu7eCharacterEditor, character: cocCharacter },
];

function open({ Editor, character }: (typeof EDITORS)[number], sheet: Record<string, unknown> = {}) {
  const onSave = vi.fn<EditorProps['onSave']>().mockResolvedValue(undefined);
  render(<Editor character={character(sheet)} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByTitle('Change theme color'));
  return onSave;
}

const hexBox = () => screen.getByLabelText('Custom colour hex code') as HTMLInputElement;
const savedColour = (onSave: ReturnType<typeof open>) =>
  (onSave.mock.calls[0][0] as unknown as { themeColor?: string }).themeColor;

describe.each(EDITORS)('$system custom colour', (entry) => {
  it('saves a three-digit colour as the six-digit form the server accepts', async () => {
    const onSave = open(entry);
    fireEvent.change(hexBox(), { target: { value: '#fff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(savedColour(onSave)).toBe('#ffffff');
  });

  it('refuses an unfinished colour with a message, and does not save', async () => {
    const onSave = open(entry);
    fireEvent.change(hexBox(), { target: { value: '#12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/#rgb or #rrggbb/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('opens a stored three-digit colour as that colour', async () => {
    const onSave = open(entry, { themeColor: '#abc' });
    expect(hexBox().value).toBe('#aabbcc');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(savedColour(onSave)).toBe('#aabbcc');
  });
});
