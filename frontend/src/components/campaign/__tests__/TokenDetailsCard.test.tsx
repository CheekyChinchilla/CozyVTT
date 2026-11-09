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

  // It was 32 pixels square, and the card shows only after a finger's or a
  // pen's tap. jsdom cannot show a touch screen's size, so the classes are
  // what is checked.
  it('has a close button big enough for a finger, with its cross in the middle', () => {
    render(<TokenDetailsCard token={wolf} square={wolf.position} hp={null} mayMove onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Close details' }).className.split(/\s+/))
      .toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
  });

  // The compact layout's dock places it; elsewhere it keeps its corner.
  it('keeps the map’s bottom left corner unless docked, and the dock’s width when docked', () => {
    const { rerender } = render(<TokenDetailsCard token={wolf} square={wolf.position} hp={null} mayMove />);
    const card = () => screen.getByText('Dire Wolf').closest('.glass-panel')!.className.split(/\s+/);
    expect(card()).toEqual(expect.arrayContaining(['absolute', 'bottom-4', 'left-4', 'w-88', 'max-w-[calc(100%-2rem)]']));

    rerender(<TokenDetailsCard token={wolf} square={wolf.position} hp={null} mayMove docked />);
    expect(card()).toEqual(expect.arrayContaining(['relative', 'w-full', 'sm:w-88']));
    expect(card()).not.toEqual(expect.arrayContaining(['absolute']));
  });
});
