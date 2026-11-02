/**
 * The character menu of the roster and the initiative tracker on a touch
 * screen: each item was 36 pixels tall, under the 44 a finger needs. The
 * height is set only where the primary pointer is coarse, which jsdom cannot
 * show, so the class is what is checked. A menu taller than the screen stays
 * within it and scrolls. It is drawn outside the page's panel group, whose
 * dividers took a press on an item that lay over one.
 */

import { it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { FileText, Trash2 } from 'lucide-react';
import CharacterContextMenu from '../CharacterContextMenu';
import { anyMenuShown, menuOpened, whenMenuOpens } from '@/components/ui/openMenus';

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

// A long-press that opens another menu, the map's or the other list's,
// brings no mousedown here to close this one.
it('closes when another menu opens, and not on its own opening', () => {
  const onClose = vi.fn();
  render(
    <CharacterContextMenu
      x={10}
      y={10}
      onClose={onClose}
      items={[{ kind: 'command', id: 'view', icon: FileText, label: 'View Character Sheet', run: vi.fn() }]}
    />,
  );
  expect(onClose).not.toHaveBeenCalled();

  act(() => { menuOpened(); });

  expect(onClose).toHaveBeenCalledTimes(1);
});

// The roster and the tracker hand it a new onClose each time they render, and
// a menu can open in the same render; it must still close.
it('closes when another menu opens in a render that hands it a new onClose', () => {
  const closed = vi.fn();
  /** Says a menu has opened each time `opening` goes up, as the map's menus do. */
  function Opener({ opening }: { opening: number }) {
    useEffect(() => { if (opening > 0) menuOpened(); }, [opening]);
    return null;
  }
  const both = (opening: number) => (
    <>
      <Opener opening={opening} />
      <CharacterContextMenu
        x={10}
        y={10}
        onClose={() => closed()}
        items={[{ kind: 'command', id: 'view', icon: FileText, label: 'View Character Sheet', run: vi.fn() }]}
      />
    </>
  );
  const { rerender } = render(both(0));
  expect(closed).not.toHaveBeenCalled();

  rerender(both(1));

  expect(closed).toHaveBeenCalledTimes(1);
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
