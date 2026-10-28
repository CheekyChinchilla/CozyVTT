/**
 * The character menu of the roster and the initiative tracker on a touch
 * screen: each item was 36 pixels tall, under the 44 a finger needs. The
 * height is set only where the primary pointer is coarse, which jsdom cannot
 * show, so the class is what is checked. A menu taller than the screen stays
 * within it and scrolls. It is drawn outside the page's panel group, whose
 * dividers took a press on an item that lay over one.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileText, Trash2 } from 'lucide-react';
import CharacterContextMenu from '../CharacterContextMenu';
import { anyMenuShown, whenMenuOpens } from '@/components/ui/openMenus';

it('makes every item tall enough for a finger on a touch screen', () => {
  render(
    <CharacterContextMenu
      x={10}
      y={10}
      onClose={vi.fn()}
      items={[
        { kind: 'command', id: 'view', icon: FileText, label: 'View Character Sheet', run: vi.fn() },
        { kind: 'command', id: 'remove', icon: Trash2, label: 'Remove from Campaign', run: vi.fn(), tone: 'danger' },
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
      items={[{ kind: 'command', id: 'view', icon: FileText, label: 'View Character Sheet', run: vi.fn() }]}
    />,
  );

  const menu = screen.getByRole('button', { name: 'View Character Sheet' }).parentElement!;
  expect(menu.className.split(/\s+/))
    .toEqual(expect.arrayContaining(['pointer-coarse:max-h-[calc(100dvh-1rem)]', 'pointer-coarse:overflow-y-auto', 'pointer-coarse:overscroll-contain']));
});

// The panel library takes a press in a divider's strip whenever the pressed
// element is inside its group ([data-group]), whatever is drawn over the
// divider; a menu outside the group keeps its presses.
it('is drawn on the body, outside the panel group it is opened from', () => {
  render(
    <div data-group>
      <CharacterContextMenu
        x={10}
        y={10}
        onClose={vi.fn()}
        items={[{ kind: 'command', id: 'view', icon: FileText, label: 'View Character Sheet', run: vi.fn() }]}
      />
    </div>,
  );

  const menu = screen.getByRole('button', { name: 'View Character Sheet' }).parentElement;
  expect(menu?.closest('[data-group]')).toBeNull();
  expect(menu?.parentElement).toBe(document.body);
});

// Its opening closes the map's token or door menu (components/ui/openMenus.ts).
// A menu with no items is not drawn, and closes nothing.
it('says it has opened when it is drawn, and not when it has no items to draw', () => {
  const told = vi.fn();
  const stop = whenMenuOpens(told);
  try {
    const { unmount } = render(<CharacterContextMenu x={10} y={10} onClose={vi.fn()} items={[]} />);
    expect(told).not.toHaveBeenCalled();
    unmount();

    render(
      <CharacterContextMenu
        x={10}
        y={10}
        onClose={vi.fn()}
        items={[{ kind: 'command', id: 'view', icon: FileText, label: 'View Character Sheet', run: vi.fn() }]}
      />,
    );
    expect(told).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

// The map asks, so a tap on it that closes this menu is not the first of a
// double tap to ping.
it('is a menu on the screen while it is drawn, and not with no items to draw', () => {
  const empty = render(<CharacterContextMenu x={10} y={10} onClose={vi.fn()} items={[]} />);
  expect(anyMenuShown()).toBe(false);
  empty.unmount();

  const drawn = render(
    <CharacterContextMenu
      x={10}
      y={10}
      onClose={vi.fn()}
      items={[{ kind: 'command', id: 'view', icon: FileText, label: 'View Character Sheet', run: vi.fn() }]}
    />,
  );
  expect(anyMenuShown()).toBe(true);
  drawn.unmount();
  expect(anyMenuShown()).toBe(false);
});
