/**
 * The bar shown while a finger or a pen holds a token: a way back for a hold
 * that has no mouse to leave the map with and no Esc key to press.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HeldTokenBar from '../HeldTokenBar';

describe('HeldTokenBar', () => {
  it('names the token held and offers Put back', () => {
    render(<HeldTokenBar name="Goblin Scout" onPutBack={() => undefined} />);

    expect(screen.getByText('Goblin Scout')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Put back' })).toBeInTheDocument();
  });

  it('puts the token back on Put back, once per press', () => {
    const onPutBack = vi.fn();
    render(<HeldTokenBar name="Goblin Scout" onPutBack={onPutBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Put back' }));

    expect(onPutBack).toHaveBeenCalledTimes(1);
  });

  // It sits over the map, top-centre under the toolbar, clear of the details
  // card in the bottom-left and the preview controls in the bottom-right.
  it('sits top-centre over the map', () => {
    const { container } = render(<HeldTokenBar name="Goblin Scout" onPutBack={() => undefined} />);
    const bar = container.firstElementChild as HTMLElement;

    expect(bar.className.split(/\s+/)).toEqual(expect.arrayContaining(['absolute', 'left-1/2', '-translate-x-1/2']));
    expect(bar.className).toMatch(/\btop-\d+\b/);
  });
});

describe('HeldTokenBar with a long name', () => {
  // On a narrow tablet the bar ran out of room: the name was cut short, as
  // it should be, but Put back broke onto two lines. The button keeps its
  // width and its one line; the name gives way.
  it('cuts the name short and keeps Put back on one line', () => {
    render(<HeldTokenBar name="Ser Bartholomew the Unyielding, Warden of the Sunken Crown" onPutBack={() => undefined} />);
    const putBack = screen.getByRole('button', { name: 'Put back' }).className.split(/\s+/);
    const name = screen.getByText(/^Holding/).className.split(/\s+/);

    expect(putBack).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']));
    expect(name).toEqual(expect.arrayContaining(['min-w-0', 'truncate']));
  });

  // Placed from the map's middle, the bar was as wide as the half to its
  // right allowed, so the name was cut at half the map's width. It is as
  // wide as it needs, up to the map's width less a margin each side.
  it('may be as wide as the map, less its margins, before the name gives way', () => {
    const { container } = render(<HeldTokenBar name="Goblin Scout" onPutBack={() => undefined} />);

    expect((container.firstElementChild as HTMLElement).className.split(/\s+/))
      .toEqual(expect.arrayContaining(['w-max', 'max-w-[calc(100%-2rem)]']));
  });
});

describe('HeldTokenBar on a touch screen', () => {
  // On a narrow tablet the bar and the DM's tool stack (z-30) meet under the
  // toolbar, and the stack covered Put back.
  it('lies over the DM tool stack', () => {
    const { container } = render(<HeldTokenBar name="Goblin Scout" onPutBack={() => undefined} />);
    const layer = Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec((container.firstElementChild as HTMLElement).className)?.[1] ?? 0);

    expect(layer).toBeGreaterThan(30);
  });

  it('starts at the top it is given, under a toolbar taller than one row of a mouse’s buttons', () => {
    const { container, rerender } = render(<HeldTokenBar name="Goblin Scout" onPutBack={() => undefined} />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.top).toBe('');

    rerender(<HeldTokenBar name="Goblin Scout" onPutBack={() => undefined} top={118} />);
    expect(bar.style.top).toBe('118px');
  });

  // Put back was a small button, about 32 pixels tall, and the bar shows
  // only for a finger's or a pen's hold.
  it('makes Put back big enough for a finger', () => {
    render(<HeldTokenBar name="Goblin Scout" onPutBack={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Put back' }).className.split(/\s+/)).toContain('touch-target');
  });
});
