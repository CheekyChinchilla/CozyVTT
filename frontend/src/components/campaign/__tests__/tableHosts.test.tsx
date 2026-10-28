/**
 * The parts of the table are drawn once and moved between the slots of the
 * arrangement on screen (tableHosts.tsx), so a change of arrangement
 * remounts none of them.
 *
 * Two arrangements stand in for the page's: each gives the parts slots of
 * its own, in its own places. A part counts its mounts and unmounts, keeps
 * a number in its own state, and has a button to hold the keyboard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TableHosts, useTableSlot, type TablePart } from '../tableHosts';

const life = { mounts: 0, unmounts: 0, mountedIn: [] as Array<string | null> };

function Part({ name }: { name: string }) {
  const [presses, setPresses] = useState(0);
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    life.mounts += 1;
    // Where the part is as it first lays out: its slot, measured in place.
    life.mountedIn.push(ref.current?.closest('[data-slot]')?.getAttribute('data-slot') ?? null);
    return () => { life.unmounts += 1; };
  }, []);
  return <button ref={ref} onClick={() => setPresses((n) => n + 1)}>{`${name} pressed ${presses}`}</button>;
}

function Slot({ part, where }: { part: TablePart; where: string }) {
  const slot = useTableSlot(part);
  return <div ref={slot.ref} data-slot={`${where}-${part}`} />;
}

function Wide() {
  return (
    <main data-arrangement="wide">
      <Slot part="party" where="wide" />
      <Slot part="map" where="wide" />
      <Slot part="session" where="wide" />
    </main>
  );
}

function Narrow() {
  return (
    <main data-arrangement="narrow">
      <Slot part="map" where="narrow" />
      <Slot part="session" where="narrow" />
      <Slot part="party" where="narrow" />
    </main>
  );
}

const parts = { map: <Part name="Map" />, session: <Part name="Session" />, party: <Part name="Party" /> };

function Table({ arrangement }: { arrangement: 'wide' | 'narrow' | 'none' }) {
  return (
    <TableHosts parts={parts}>
      {arrangement === 'wide' && <Wide />}
      {arrangement === 'narrow' && <Narrow />}
    </TableHosts>
  );
}

const part = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} pressed`) });
const slotOf = (el: Element) => el.closest('[data-slot]')?.getAttribute('data-slot') ?? null;

beforeEach(() => {
  life.mounts = 0;
  life.unmounts = 0;
  life.mountedIn = [];
});

describe('a part of the table', () => {
  it('mounts once, already in its slot', () => {
    render(<Table arrangement="wide" />);

    expect(life.mounts).toBe(3);
    expect(life.mountedIn.sort()).toEqual(['wide-map', 'wide-party', 'wide-session']);
    expect(slotOf(part('Map'))).toBe('wide-map');
  });

  it('moves to the next arrangement\'s slot as the same element, with its state, and never mounts again', () => {
    const { rerender } = render(<Table arrangement="wide" />);
    const map = part('Map');
    fireEvent.click(map);
    fireEvent.click(map);

    rerender(<Table arrangement="narrow" />);

    expect(part('Map')).toBe(map);
    expect(slotOf(map)).toBe('narrow-map');
    expect(map.textContent).toBe('Map pressed 2');
    expect(slotOf(part('Session'))).toBe('narrow-session');
    expect(slotOf(part('Party'))).toBe('narrow-party');

    rerender(<Table arrangement="wide" />);

    expect(slotOf(map)).toBe('wide-map');
    expect(life).toMatchObject({ mounts: 3, unmounts: 0 });
  });

  it('keeps the keyboard through a move', () => {
    const { rerender } = render(<Table arrangement="wide" />);
    part('Session').focus();

    rerender(<Table arrangement="narrow" />);
    expect(document.activeElement).toBe(part('Session'));

    rerender(<Table arrangement="wide" />);
    expect(document.activeElement).toBe(part('Session'));
  });

  it('moves with the browser\'s own move where it has one, which keeps the focus itself', () => {
    const moved: Element[] = [];
    // A stand-in for moveBefore: an append that, as the real one does, keeps the focus.
    const moveBefore = function (this: Element, node: Node) {
      const focused = document.activeElement;
      this.appendChild(node);
      if (focused instanceof HTMLElement) focused.focus();
      if (node instanceof Element) moved.push(node);
    };
    Object.defineProperty(Element.prototype, 'moveBefore', { value: moveBefore, configurable: true, writable: true });
    try {
      const { rerender } = render(<Table arrangement="wide" />);
      part('Map').focus();
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');

      rerender(<Table arrangement="narrow" />);

      expect(moved.length).toBeGreaterThan(0);
      expect(slotOf(part('Map'))).toBe('narrow-map');
      expect(document.activeElement).toBe(part('Map'));
      // Only the stand-in's own focus calls: the page gave nothing back.
      expect(focus.mock.calls.length).toBe(moved.length);
      focus.mockRestore();
    } finally {
      delete (Element.prototype as Partial<Element>).moveBefore;
    }
  });

  it('waits, mounted and out of sight, while no arrangement gives it a slot', () => {
    const { rerender } = render(<Table arrangement="wide" />);
    const map = part('Map');

    rerender(<Table arrangement="none" />);

    expect(map.isConnected).toBe(true);
    expect(slotOf(map)).toBeNull();
    const parking = map.closest<HTMLElement>('[data-table-part]')!.parentElement!;
    expect(parking.style).toMatchObject({ position: 'fixed', width: '0px', height: '0px', overflow: 'hidden' });

    rerender(<Table arrangement="narrow" />);

    expect(slotOf(map)).toBe('narrow-map');
    expect(life).toMatchObject({ mounts: 3, unmounts: 0 });
  });

  it('is not drawn until a slot is given to it', () => {
    function MapOnly() {
      return <Slot part="map" where="only" />;
    }
    render(<TableHosts parts={parts}><MapOnly /></TableHosts>);

    expect(life.mounts).toBe(1);
    expect(screen.queryByRole('button', { name: /^Session/ })).toBeNull();
  });

  it('keeps one ResizeObserver observation through a move', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    class RO { observe = observe; unobserve() {} disconnect = disconnect; }
    const saved = window.ResizeObserver;
    Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true, writable: true });
    try {
      function Observed() {
        const ref = useRef<HTMLDivElement>(null);
        useEffect(() => {
          const observer = new ResizeObserver(() => {});
          if (ref.current) observer.observe(ref.current);
          return () => observer.disconnect();
        }, []);
        return <div ref={ref}>Observed</div>;
      }
      const observed = { ...parts, map: <Observed /> };
      const { rerender } = render(<TableHosts parts={observed}><Wide /></TableHosts>);

      rerender(<TableHosts parts={observed}><Narrow /></TableHosts>);
      rerender(<TableHosts parts={observed}><Wide /></TableHosts>);

      expect(observe).toHaveBeenCalledTimes(1);
      expect(disconnect).not.toHaveBeenCalled();
      expect(slotOf(screen.getByText('Observed'))).toBe('wide-map');
    } finally {
      Object.defineProperty(window, 'ResizeObserver', { value: saved, configurable: true, writable: true });
    }
  });

  it('moves no part when the table and its arrangement draw again', () => {
    const { rerender } = render(<Table arrangement="wide" />);
    const append = vi.spyOn(Element.prototype, 'appendChild');
    try {
      rerender(<Table arrangement="wide" />);
      rerender(<Table arrangement="wide" />);

      const hostMoves = append.mock.calls.filter(([node]) => node instanceof HTMLElement && node.dataset.tablePart);
      expect(hostMoves).toEqual([]);
    } finally {
      append.mockRestore();
    }
    expect(slotOf(part('Map'))).toBe('wide-map');
  });

  it('gives a slot that comes to name another part that part, and the first waits for a slot', () => {
    function OneSlot({ shows }: { shows: TablePart }) {
      return <Slot part={shows} where="one" />;
    }
    const { rerender } = render(<TableHosts parts={parts}><OneSlot shows="map" /></TableHosts>);
    const map = part('Map');

    rerender(<TableHosts parts={parts}><OneSlot shows="party" /></TableHosts>);

    expect(slotOf(part('Party'))).toBe('one-party');
    expect(map.isConnected).toBe(true);
    expect(slotOf(map)).toBeNull();
    expect(life).toMatchObject({ mounts: 2, unmounts: 0 });
  });

  it('leaves nothing on the page once the table is gone', () => {
    const { unmount } = render(<Table arrangement="wide" />);

    act(() => unmount());

    expect(document.querySelector('[data-table-part]')).toBeNull();
    expect(life.unmounts).toBe(3);
  });
});

describe('a slot with no table hosts above it', () => {
  it('says so, for the component to draw the part itself', () => {
    function Alone() {
      const slot = useTableSlot('session');
      return <div ref={slot.ref}>{slot.hosted ? 'hosted' : 'drawn in place'}</div>;
    }

    render(<Alone />);

    expect(screen.getByText('drawn in place')).toBeTruthy();
  });
});
