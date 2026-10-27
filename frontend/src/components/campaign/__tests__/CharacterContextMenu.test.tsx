/**
 * The character menu of the roster and the initiative tracker on a touch
 * screen: each item was 36 pixels tall, under the 44 a finger needs. The
 * height is set only where the primary pointer is coarse, which jsdom cannot
 * show, so the class is what is checked. A menu taller than the screen stays
 * within it and scrolls.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileText, Trash2 } from 'lucide-react';
import CharacterContextMenu from '../CharacterContextMenu';

it('makes every item tall enough for a finger on a touch screen', () => {
  render(
    <CharacterContextMenu
      x={10}
      y={10}
      onClose={vi.fn()}
      items={[
        { icon: FileText, label: 'View Character Sheet', onClick: vi.fn(), visible: true },
        { icon: Trash2, label: 'Remove from Campaign', onClick: vi.fn(), visible: true, className: 'text-danger-ink' },
      ]}
    />,
  );

  for (const name of ['View Character Sheet', 'Remove from Campaign']) {
    expect(screen.getByRole('button', { name }).className.split(/\s+/)).toContain('pointer-coarse:min-h-11');
  }
});

// Only on a touch screen, whose items are 44 pixels: a scrolling menu would
// cut the sides off a keyboard's focus ring, and a mouse's menu fits.
it('stays within the screen on a touch screen, scrolling inside, however tall it is', () => {
  render(
    <CharacterContextMenu
      x={10}
      y={10}
      onClose={vi.fn()}
      items={[{ icon: FileText, label: 'View Character Sheet', onClick: vi.fn(), visible: true }]}
    />,
  );

  const menu = screen.getByRole('button', { name: 'View Character Sheet' }).parentElement!;
  expect(menu.className.split(/\s+/))
    .toEqual(expect.arrayContaining(['pointer-coarse:max-h-[calc(100dvh-1rem)]', 'pointer-coarse:overflow-y-auto', 'pointer-coarse:overscroll-contain']));
});
