/**
 * The Flexible sheet sits on the theme's paper, as the other sheets do.
 *
 * Its card and sections were glass panels, a white wash meant for a dark page
 * background, so on a light theme their edges did not show, and its insets
 * were the surface colour, which turns the other way on a dark theme.
 */
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Character } from '@/types';
import { FlexibleCharacterSheetView } from '../flexible/FlexibleCharacterSheetView';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const character = {
  id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: null, tokenImageUrl: null,
  data: { sections: [{ id: 's1', title: 'Notes', type: 'text', value: 'A note' }] },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Character;

it('draws its card and sections on paper', () => {
  const { container } = render(<FlexibleCharacterSheetView character={character} />);
  expect(container.querySelector('.glass-panel')).toBeNull();
  expect(screen.getByText('A note').closest('.bg-ink\\/5')).not.toBeNull();
});
