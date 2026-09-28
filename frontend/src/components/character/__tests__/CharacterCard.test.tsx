/**
 * The gallery card offers Edit only where the save would be accepted. An
 * owner who is a spectator in the character's campaign may read the sheet
 * but not change it; the page works that out (canEditCharacterIn) and the
 * card leaves Edit out.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CharacterCard from '../CharacterCard';
import type { Character } from '@/types';

const character = {
  id: 'c1', userId: 'me', name: 'Aria', gameSystem: 'DND_5E', campaignId: 'camp', data: {},
  tokenImageUrl: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Character;
const noop = () => undefined;

function openMenu(canEdit?: boolean) {
  render(
    <CharacterCard
      character={character} campaign={null} onView={noop} onEdit={noop} canEdit={canEdit}
      onCopy={noop} onDelete={noop} onAssign={noop} onExport={noop}
    />
  );
  fireEvent.click(screen.getByLabelText('Character actions'));
}

describe('the character card menu', () => {
  it('offers Edit by default', () => {
    openMenu();
    expect(screen.getByText('Edit Character')).toBeInTheDocument();
  });

  it('leaves Edit out when the page says the save would be refused', () => {
    openMenu(false);
    expect(screen.queryByText('Edit Character')).not.toBeInTheDocument();
    expect(screen.getByText('Copy/Duplicate')).toBeInTheDocument();
  });
});
