/**
 * Advantage and disadvantage from a sheet by touch: press and hold an
 * ability, a save, a skill or an attack for half a second and its roll menu
 * opens there, as a right-click opens it with a mouse.
 *
 * Only a right-click opened the menu, and Safari on an iPhone or an iPad
 * makes none. The press is the map's (hooks/useLongPress.ts, the map's
 * recogniser and numbers), told apart at the sheet's root for every row
 * marked as a d20 test, so the rows carry no handler of their own for it.
 * The hard cases: a press that moves, as a scroll begins, opens nothing and
 * rolls nothing; a long-press never also rolls as the finger lifts; a mouse
 * keeps its click and its right-click as they were.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DnD5eCharacterView } from '../dnd5e/DnD5eCharacterView';
import { Pathfinder2eCharacterView } from '../pathfinder2e/Pathfinder2eCharacterView';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { contact, mouse } from '@/test/pointer';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const spear = { name: 'Spear', attackBonus: 4, damageRoll: '1d6+2', damageType: 'piercing', range: 20, properties: [], notes: '' };
const longsword = { name: 'Longsword', type: 'melee', attackBonus: 7, damageRoll: '1d8+4', damageType: 'slashing' };

const at = (clientX: number, clientY: number) => ({ clientX, clientY });
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const menu = () => screen.queryByRole('menu');

function dnd(onRoll = vi.fn(), overrides: Record<string, unknown> = {}) {
  render(<DnD5eCharacterView character={dnd5eCharacter(overrides)} onRoll={onRoll} />);
  return onRoll;
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { vi.useRealTimers(); });

describe('press and hold a stat', () => {
  it('opens its roll menu at half a second, where the finger is', () => {
    dnd();
    const finger = contact('touch', 1);

    finger.down(screen.getByText('dexterity'), at(40, 20));
    wait(499);
    expect(menu()).toBeNull();
    wait(1);

    expect(screen.getByRole('menu', { name: 'Dexterity Save' })).toHaveStyle({ left: '40px', top: '20px' });
  });

  it('never also rolls the stat as the finger lifts, and the menu stays open for a tap', () => {
    const onRoll = dnd();
    const finger = contact('touch', 1);

    finger.down(screen.getByText('dexterity'), at(40, 20));
    wait(500);
    finger.up(screen.getByText('dexterity'), at(40, 20));
    fireEvent.mouseDown(screen.getByText('dexterity'));
    fireEvent.click(screen.getByText('dexterity'), { detail: 1 });

    expect(onRoll).not.toHaveBeenCalled();
    expect(menu()).toBeInTheDocument();

    const advantage = screen.getByRole('menuitem', { name: 'Advantage' });
    contact('touch', 2).down(advantage, at(60, 50));
    contact('touch', 2).up(advantage, at(60, 50));
    fireEvent.click(advantage, { detail: 1 });

    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(onRoll).toHaveBeenCalledWith('2d20kh1+0', 'Dexterity Save (Advantage)');
  });

  it('opens nothing and rolls nothing when the finger moves 8 pixels, as a scroll begins', () => {
    const onRoll = dnd();
    const finger = contact('touch', 1);

    finger.down(screen.getByText('Stealth'), at(40, 100));
    finger.move(screen.getByText('Stealth'), at(40, 108));
    wait(1000);
    finger.up(screen.getByText('Stealth'), at(40, 140));

    expect(menu()).toBeNull();
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('opens nothing when the browser takes the finger to scroll', () => {
    const onRoll = dnd();
    const finger = contact('touch', 1);

    finger.down(screen.getByText('Stealth'), at(40, 100));
    wait(200);
    finger.cancel(screen.getByText('Stealth'));
    wait(1000);

    expect(menu()).toBeNull();
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('opens the menu of a skill, an ability and an attack too', () => {
    dnd(vi.fn(), { attacks: [spear] });

    const hold = (text: string, pointerId: number) => {
      const finger = contact('touch', pointerId);
      finger.down(screen.getByText(text), at(40, 20));
      wait(500);
      finger.up(screen.getByText(text), at(40, 20));
      const name = screen.getByRole('menu').getAttribute('aria-label');
      fireEvent.pointerDown(document.body);
      return name;
    };

    expect(hold('Stealth', 1)).toBe('Stealth Check');
    expect(hold('STR', 2)).toBe('Strength Check');
    fireEvent.click(screen.getByRole('button', { name: 'Combat' }));
    expect(hold('Spear', 3)).toBe('Spear Attack');
  });

  it('opens once when Android sends its own long-press first, and the timer adds nothing', () => {
    dnd();
    const finger = contact('touch', 1);

    finger.down(screen.getByText('dexterity'), at(40, 20));
    wait(300);
    const unhandled = fireEvent.contextMenu(screen.getByText('dexterity'), at(41, 21));
    wait(700);

    expect(unhandled).toBe(false);
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menu')).toHaveStyle({ left: '41px', top: '21px' });
  });

  it('opens Fortune and Misfortune on a Pathfinder 2e strike', () => {
    render(<Pathfinder2eCharacterView character={pf2eCharacter({ strikes: [longsword] })} onRoll={vi.fn()} />);
    const finger = contact('touch', 1);

    finger.down(screen.getByText('Longsword'), at(40, 20));
    wait(500);

    expect(screen.getByRole('menu', { name: 'Longsword Strike' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Normal', 'Fortune', 'Misfortune']);
  });
});

describe('away from the stats', () => {
  it('a press held on a heading opens nothing, and the next tap on a stat rolls it', () => {
    const onRoll = dnd();
    const finger = contact('touch', 1);

    finger.down(screen.getByText('Saving Throws'), at(40, 5));
    wait(1000);
    finger.up(screen.getByText('Saving Throws'), at(40, 5));
    fireEvent.click(screen.getByText('dexterity'), { detail: 1 });

    expect(menu()).toBeNull();
    expect(onRoll).toHaveBeenCalledWith('1d20+0', 'Dexterity Save');
  });

  it("leaves Android's own long-press there to the browser", () => {
    dnd();
    contact('touch', 1).down(screen.getByText('Saving Throws'), at(40, 5));

    expect(fireEvent.contextMenu(screen.getByText('Saving Throws'), at(40, 5))).toBe(true);
    expect(menu()).toBeNull();
  });

  it('a sheet that cannot roll opens nothing', () => {
    render(<DnD5eCharacterView character={dnd5eCharacter()} />);

    contact('touch', 1).down(screen.getByText('dexterity'), at(40, 20));
    wait(1000);

    expect(menu()).toBeNull();
  });
});

describe('with a mouse, as before', () => {
  it('a click rolls, holding the button opens nothing, and a right-click opens the menu', () => {
    const onRoll = dnd();

    mouse.down(screen.getByText('dexterity'), at(40, 20));
    wait(1000);
    mouse.up(screen.getByText('dexterity'), at(40, 20));
    fireEvent.click(screen.getByText('dexterity'), { detail: 1 });
    expect(menu()).toBeNull();
    expect(onRoll).toHaveBeenCalledWith('1d20+0', 'Dexterity Save');

    expect(fireEvent.contextMenu(screen.getByText('dexterity'), at(40, 20))).toBe(false);
    expect(screen.getByRole('menu', { name: 'Dexterity Save' })).toBeInTheDocument();
  });
});

describe('the rows', () => {
  it('say how they roll, and take no text selection or iOS callout under a held finger', () => {
    dnd();

    const save = screen.getByText('dexterity').closest('[data-roll]');
    expect(save).toHaveAttribute('title', 'Click: roll  |  Right-click or press and hold: Advantage / Disadvantage');
    expect(save?.className.split(/\s+/)).toEqual(expect.arrayContaining(['select-none', '[-webkit-touch-callout:none]']));
    for (const row of document.querySelectorAll('[data-roll]')) {
      expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(['select-none', '[-webkit-touch-callout:none]']));
      expect(row.getAttribute('title')).toMatch(/^Click: roll {2}\| {2}Right-click or press and hold: /);
    }
    expect(document.querySelectorAll('[data-roll]').length).toBeGreaterThanOrEqual(6 + 6 + 18);
  });
});
