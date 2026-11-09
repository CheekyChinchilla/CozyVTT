/**
 * A long-press on a panel's row: the roster's characters and the initiative
 * tracker's combatants open the menu a right-click opens there, as a token
 * does on the map. A press is told apart by the map's own recogniser, so
 * the rules are the map's: half a second held still within 8 pixels, a
 * finger only, once per press whichever of the timer and Android's own
 * contextmenu comes first, and the click iOS may send as the finger lifts
 * swallowed once.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useLongPress, type LongPressPoint } from '../useLongPress';
import { contact, mouse } from '@/test/pointer';

const opened: LongPressPoint[] = [];
const rightClicks: number[] = [];
const clicks: number[] = [];

function Row() {
  const press = useLongPress((at) => { opened.push(at); });
  return (
    <div
      data-testid="row"
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={(e) => {
        if (press.takeContextMenu(e)) return;
        e.preventDefault();
        rightClicks.push(e.clientX);
      }}
      onClick={(e) => { clicks.push(e.detail); }}
    >
      <span>Goblin</span>
      <button type="button" data-drag-grip>Grip</button>
      <input aria-label="Value" />
    </div>
  );
}

const row = () => screen.getByTestId('row');
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const at = (clientX: number, clientY: number) => ({ clientX, clientY });

beforeEach(() => {
  opened.length = 0;
  rightClicks.length = 0;
  clicks.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => { vi.useRealTimers(); });

describe('a finger held on a row', () => {
  it('opens once at half a second, where the finger is, and not again on the lift', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(screen.getByText('Goblin'), at(40, 20));
    wait(499);
    expect(opened).toEqual([]);
    wait(1);
    expect(opened).toEqual([at(40, 20)]);

    finger.up(screen.getByText('Goblin'), at(40, 20));
    wait(1000);
    expect(opened).toEqual([at(40, 20)]);
  });

  it('still opens through a jitter under 8 pixels', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(row(), at(40, 20));
    finger.move(row(), at(45, 23));
    wait(500);

    expect(opened).toEqual([at(45, 23)]);
  });

  it('opens nothing once it moves 8 pixels, as the start of a scroll does', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(row(), at(40, 20));
    finger.move(row(), at(40, 28));
    wait(1000);

    expect(opened).toEqual([]);
  });

  it('opens nothing when the browser takes the pointer, as a scroll does', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(row(), at(40, 20));
    wait(300);
    finger.cancel(row());
    wait(1000);

    expect(opened).toEqual([]);
  });

  it('opens nothing when a second finger lands', () => {
    render(<Row />);

    contact('touch', 1).down(row(), at(40, 20));
    wait(200);
    contact('touch', 2, false).down(row(), at(90, 20));
    wait(1000);

    expect(opened).toEqual([]);
  });

  it('opens nothing from a press on a control that is not the row\'s, or on an input', () => {
    render(<Row />);

    contact('touch', 1).down(screen.getByText('Grip'), at(40, 20));
    wait(1000);
    contact('touch', 1).up(screen.getByText('Grip'), at(40, 20));
    contact('touch', 2).down(screen.getByLabelText('Value'), at(40, 20));
    wait(1000);

    expect(opened).toEqual([]);
  });
});

describe('a mouse and a pen', () => {
  it('never open by holding, however long', () => {
    render(<Row />);

    mouse.down(row(), at(40, 20));
    wait(2000);
    mouse.up(row(), at(40, 20));
    contact('pen', 5).down(row(), at(40, 20));
    wait(2000);

    expect(opened).toEqual([]);
  });

  it("leave a right-click to the row's own handler", () => {
    render(<Row />);

    fireEvent.contextMenu(row(), at(40, 20));

    expect(rightClicks).toEqual([40]);
    expect(opened).toEqual([]);
  });
});

describe("Android's own long-press, a contextmenu while the finger is down", () => {
  it('opens once when it comes before the timer, and the timer adds nothing', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(row(), at(40, 20));
    wait(400);
    const unhandled = fireEvent.contextMenu(row(), at(41, 21));
    wait(600);
    finger.up(row(), at(41, 21));

    expect(unhandled).toBe(false);
    expect(opened).toEqual([at(41, 21)]);
    expect(rightClicks).toEqual([]);
  });

  it('is used up when the timer came first', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(row(), at(40, 20));
    wait(500);
    const unhandled = fireEvent.contextMenu(row(), at(40, 20));

    expect(unhandled).toBe(false);
    expect(opened).toEqual([at(40, 20)]);
    expect(rightClicks).toEqual([]);
  });

  it('opens nothing for a press that has moved past the slop, or one on a control that is not the row\'s', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(row(), at(40, 20));
    finger.move(row(), at(60, 20));
    const moved = fireEvent.contextMenu(row(), at(60, 20));
    finger.up(row(), at(60, 20));
    contact('touch', 2).down(screen.getByText('Grip'), at(40, 20));
    const onGrip = fireEvent.contextMenu(screen.getByText('Grip'), at(40, 20));

    expect([moved, onGrip]).toEqual([false, false]);
    expect(opened).toEqual([]);
    expect(rightClicks).toEqual([]);
  });
});

describe('what the lift may bring', () => {
  it('swallows the first click after an open, so the row does not also do what a tap does', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(row(), at(40, 20));
    wait(500);
    finger.up(row(), at(40, 20));
    fireEvent.click(row(), { detail: 1 });
    fireEvent.click(row(), { detail: 1 });

    expect(clicks).toEqual([1]);
  });

  it('swallows the first mousedown too, which closes a menu that listens on the document', () => {
    const onDocument = vi.fn();
    document.addEventListener('mousedown', onDocument);
    try {
      render(<Row />);
      const finger = contact('touch', 1);

      finger.down(row(), at(40, 20));
      wait(500);
      finger.up(row(), at(40, 20));
      fireEvent.mouseDown(row());

      expect(onDocument).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('mousedown', onDocument);
    }
  });

  it('swallows nothing once a new press starts', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(row(), at(40, 20));
    wait(500);
    finger.up(row(), at(40, 20));
    contact('touch', 2).down(row(), at(40, 20));
    fireEvent.click(row(), { detail: 1 });

    expect(clicks).toEqual([1]);
  });

  it('swallows nothing after a tap', () => {
    render(<Row />);
    const finger = contact('touch', 1);

    finger.down(row(), at(40, 20));
    finger.up(row(), at(40, 20));
    fireEvent.click(row(), { detail: 1 });

    expect(clicks).toEqual([1]);
  });
});

describe('one handler for many rows (`within`)', () => {
  const openedOn: string[] = [];
  const listClicks: string[] = [];

  function List() {
    const press = useLongPress((_at, on) => { openedOn.push(on.textContent ?? ''); }, { within: '[data-row]' });
    return (
      <div
        data-testid="list"
        onPointerDown={press.onPointerDown}
        onPointerMove={press.onPointerMove}
        onPointerUp={press.onPointerUp}
        onPointerCancel={press.onPointerCancel}
        onContextMenu={(e) => { press.takeContextMenu(e); }}
        onClick={(e) => { listClicks.push((e.target as Element).textContent ?? ''); }}
      >
        <h3>Heading</h3>
        <div data-row><span>Goblin</span></div>
        <div data-row>Orc</div>
      </div>
    );
  }

  beforeEach(() => {
    openedOn.length = 0;
    listClicks.length = 0;
  });

  it('opens for the row the finger landed in, and says which', () => {
    render(<List />);
    const finger = contact('touch', 1);

    finger.down(screen.getByText('Goblin'), at(40, 20));
    wait(500);
    finger.up(screen.getByText('Goblin'), at(40, 20));
    contact('touch', 2).down(screen.getByText('Orc'), at(40, 60));
    wait(500);

    expect(openedOn).toEqual(['Goblin', 'Orc']);
  });

  it('opens nothing for a press between the rows, and swallows nothing after it', () => {
    render(<List />);
    const finger = contact('touch', 1);

    finger.down(screen.getByText('Heading'), at(40, 5));
    wait(1000);
    finger.up(screen.getByText('Heading'), at(40, 5));
    fireEvent.click(screen.getByText('Orc'), { detail: 1 });

    expect(openedOn).toEqual([]);
    expect(listClicks).toEqual(['Orc']);
  });

  it("opens for the row on Android's own long-press, before the timer", () => {
    render(<List />);
    const finger = contact('touch', 1);

    finger.down(screen.getByText('Orc'), at(40, 60));
    wait(300);
    fireEvent.contextMenu(screen.getByText('Orc'), at(40, 60));
    wait(700);

    expect(openedOn).toEqual(['Orc']);
  });
});
