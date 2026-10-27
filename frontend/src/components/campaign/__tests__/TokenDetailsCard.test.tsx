/**
 * The token details card on its own: its close button. What it shows for
 * whom is driven through MapCanvas (MapCanvasInput.test.tsx, "the card a
 * hovered token shows", and MapCanvasTouch.test.tsx, the selection's card).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TokenLayer, TokenType, type Token } from '@/types';
import TokenDetailsCard from '../TokenDetailsCard';

const wolf = {
  id: 'tok-wolf', name: 'Dire Wolf', imageUrl: '', position: { x: 4, y: 19 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null, characterId: null,
} as unknown as Token;

describe('TokenDetailsCard', () => {
  it('has no close button unless it is given something to close', () => {
    render(<TokenDetailsCard token={wolf} square={wolf.position} hp={null} mayMove />);

    expect(screen.getByText('Dire Wolf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close details' })).toBeNull();
  });

  it('closes on its close button', () => {
    const onClose = vi.fn();
    render(<TokenDetailsCard token={wolf} square={wolf.position} hp={null} mayMove onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
