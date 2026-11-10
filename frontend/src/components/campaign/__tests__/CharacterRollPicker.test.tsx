/**
 * Whose name a roll from the picker is filed under.
 *
 * The picker holds the character, so it supplies the name a roll goes to the
 * dice log with. Opened from an obscured token, that name would put the
 * character's real name in front of the whole table, so the token's public
 * name is passed in and used instead.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import CharacterRollPicker from '../CharacterRollPicker';
import { anyMenuShown, menuOpened, whenMenuOpens } from '@/components/ui/openMenus';
import type { Character, CharacterData, GameSystem } from '@/types';

const seelah: Character = {
  id: 'char-1',
  userId: 'alice',
  campaignId: 'camp-1',
  gameSystem: 'PATHFINDER_2E' as GameSystem,
  name: 'Seelah',
  data: {
    characterName: 'Seelah',
    class: 'Champion',
    level: 5,
    ancestry: 'Human',
    heritage: 'Versatile',
    attributes: {
      strength: { score: 18, modifier: 4 },
      dexterity: { score: 12, modifier: 1 },
      constitution: { score: 14, modifier: 2 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 12, modifier: 1 },
      charisma: { score: 16, modifier: 3 },
    },
  } as unknown as CharacterData,
  tokenImageUrl: null,
  createdAt: '',
  updatedAt: '',
};

function rollStrength(publicName?: string) {
  const onRoll = vi.fn();
  render(
    <CharacterRollPicker
      character={seelah}
      publicName={publicName}
      onRoll={onRoll}
      onClose={() => undefined}
      anchorX={0}
      anchorY={0}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /^STR / }));
  expect(onRoll).toHaveBeenCalledTimes(1);
  return onRoll.mock.calls[0] as [string, string, string | undefined];
}

describe('the name a roll is filed under', () => {
  it("is the character's, when the picker is opened for the character", () => {
    const [expression, , name] = rollStrength();
    expect(expression).toMatch(/^1d20/);
    expect(name).toBe('Seelah');
  });

  it('is the public name when one is given, so an obscured token is not named in the dice log', () => {
    const [, , name] = rollStrength('Unknown creature');
    expect(name).toBe('Unknown creature');
  });
});

describe('the close button', () => {
  it('is named Close', () => {
    const onClose = vi.fn();
    render(<CharacterRollPicker character={seelah} onRoll={vi.fn()} onClose={onClose} anchorX={0} anchorY={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // It was 20 pixels square. The size is set on a touch screen only, which
  // jsdom cannot show, so the classes are what is checked.
  it('is big enough for a finger, with its cross in the middle', () => {
    render(<CharacterRollPicker character={seelah} onRoll={vi.fn()} onClose={vi.fn()} anchorX={0} anchorY={0} />);
    expect(screen.getByRole('button', { name: 'Close' }).className.split(/\s+/))
      .toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
  });
});

describe('the roll mode', () => {
  // The picker's mode and a sheet's Roll mode apply one helper, so these pin
  // what the picker rolled before it used it.
  it('rolls a Pathfinder 2e check twice with Fortune, keeping the higher, and the log says so', () => {
    const onRoll = vi.fn();
    render(<CharacterRollPicker character={seelah} onRoll={onRoll} onClose={() => undefined} anchorX={0} anchorY={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fortune' }));
    fireEvent.click(screen.getByRole('button', { name: /^STR / }));
    expect(onRoll).toHaveBeenCalledWith('2d20kh1+4', 'Strength Check (Fortune)', 'Seelah');
  });
});

describe('the initiative entry', () => {
  const wren = (extra: Record<string, unknown>): Character => ({
    ...seelah,
    gameSystem: 'DND_5E' as GameSystem,
    name: 'Wren',
    data: {
      characterName: 'Wren',
      stats: { dexterity: { score: 14, modifier: 2 } },
      ...extra,
    } as unknown as CharacterData,
  });

  function openFor(character: Character) {
    const onRollInitiative = vi.fn();
    render(
      <CharacterRollPicker
        character={character}
        onRoll={vi.fn()}
        onRollInitiative={onRollInitiative}
        onClose={() => undefined}
        anchorX={0}
        anchorY={0}
      />
    );
    return onRollInitiative;
  }

  it('shows the two d20s a D&D 5e character with advantage on initiative rolls', () => {
    openFor(wren({ initiativeAdvantage: true }));
    expect(screen.getByRole('button', { name: /Roll Initiative/ })).toHaveTextContent('Roll Initiative2d20kh1+2');
  });

  it('shows one d20 when the box is off', () => {
    openFor(wren({ initiativeAdvantage: false }));
    expect(screen.getByRole('button', { name: /Roll Initiative/ })).toHaveTextContent('Roll Initiative1d20+2');
  });

  // The server works out the roll from the sheet; the picker's Roll mode
  // does not reach it.
  it('sends no roll of its own, whatever the roll mode', () => {
    const onRollInitiative = openFor(wren({ initiativeAdvantage: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disadvantage' }));
    fireEvent.click(screen.getByRole('button', { name: /Roll Initiative/ }));
    expect(onRollInitiative).toHaveBeenCalledWith();
  });
});

// The panel library takes a press in a divider's strip whenever the pressed
// element is inside its group ([data-group]); the picker is opened from the
// roster, the tracker and the map, all inside it.
describe('where it is drawn', () => {
  it('is on the body, outside the panel group it is opened from', () => {
    render(
      <div data-group>
        <CharacterRollPicker character={seelah} onRoll={vi.fn()} onClose={vi.fn()} anchorX={0} anchorY={0} />
      </div>,
    );

    const picker = screen.getByText('Roll for Seelah').closest('.fixed');
    expect(picker).not.toBeNull();
    expect(picker?.closest('[data-group]')).toBeNull();
    expect(picker?.parentElement).toBe(document.body);
  });
});

// The map asks, so a tap on it that closes the picker is not the first of a
// double tap to ping.
// Placed as the map's menus are (components/ui/menu.ts flipOntoScreen): the
// screen is jsdom's, 1,024 by 768, and the picker measures 300 by 400.
describe('near the edge of the screen', () => {
  const originalRect = HTMLDivElement.prototype.getBoundingClientRect;
  afterEach(() => { HTMLDivElement.prototype.getBoundingClientRect = originalRect; });

  it('flips to the left of and above the point', () => {
    HTMLDivElement.prototype.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 300, bottom: 400, width: 300, height: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    render(<CharacterRollPicker character={seelah} onRoll={vi.fn()} onClose={vi.fn()} anchorX={900} anchorY={600} />);

    const picker = screen.getByText(/^Roll for Seelah/).closest<HTMLElement>('.fixed')!;
    expect([picker.style.left, picker.style.top]).toEqual(['600px', '200px']);
  });
});

describe('while it is open', () => {
  it('is a menu on the screen, until it closes', () => {
    const { unmount } = render(<CharacterRollPicker character={seelah} onRoll={vi.fn()} onClose={vi.fn()} anchorX={0} anchorY={0} />);
    expect(anyMenuShown()).toBe(true);
    unmount();
    expect(anyMenuShown()).toBe(false);
  });
});

// A long-press that opens another menu, the map's or a list's, brings no
// mousedown here; and this one's opening closes theirs the same way.
describe('beside another menu', () => {
  it('says it has opened, and closes when another menu opens, not on its own opening', () => {
    const told = vi.fn();
    const stop = whenMenuOpens(told);
    const onClose = vi.fn();
    try {
      render(<CharacterRollPicker character={seelah} onRoll={vi.fn()} onClose={onClose} anchorX={0} anchorY={0} />);
      expect(told).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      stop();
    }

    act(() => { menuOpened(); });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
