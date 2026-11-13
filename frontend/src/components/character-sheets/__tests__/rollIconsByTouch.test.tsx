/**
 * The sheets show what rolls on a touch screen.
 *
 * Where a sheet can roll, a dice icon beside each rollable stat said so, but
 * it showed only while the pointer was over the stat (`opacity-0
 * group-hover:opacity-60`), so on a phone or a tablet nothing said a stat
 * rolls. Wherever nothing can hover (`@media (hover: none)`) the icons now
 * show as they do under a mouse; with a mouse nothing changes.
 *
 * Exempt: the editors' portrait upload hint, a dark wash over the picture
 * with an upload icon. Shown for good it would hide the picture, and tapping
 * the picture opens the file picker anyway.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FifthEditionCharacterView } from '../fifth-edition/FifthEditionCharacterView';
import { FantasyD20CharacterView } from '../fantasy-d20/FantasyD20CharacterView';
import { HorrorD100CharacterView } from '../horror-d100/HorrorD100CharacterView';
import { fifthEditionCharacter } from '../fifth-edition/__tests__/fifthEditionFixture';
import { fantasyD20Character } from '../fantasy-d20/__tests__/fantasyD20Fixture';
import { horrorD100Character } from '../horror-d100/__tests__/sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

// The negated pattern does not keep the nested test folders out of this glob,
// so they are left out by name as well.
const SOURCES = Object.fromEntries(
  Object.entries(
    import.meta.glob(['/src/components/character-sheets/**/*.tsx', '!/src/**/__tests__/**'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
  ).filter(([file]) => !file.includes('/__tests__/'))
);

/** The portrait's upload hint: a wash over the picture. */
const PORTRAIT_HINT = /\bbg-black\/50\b/;

/**
 * A mark shown under a hover, `group-hover:opacity-60`, or with a further
 * variant before the opacity, as a roll's dice icon has to stay hidden over a
 * value in its row that does not roll (`group-hover:not-group-has-[…]:opacity-60`).
 */
const HOVER_SHOWN = /group-hover:(?:\S*:)?opacity-(\d+)/;

/** Elements in `root` shown only under a hover, whose touch screen form is missing. */
function hiddenFromTouch(root: Element): string[] {
  return [...root.querySelectorAll('[class*="group-hover:"]')]
    .map((element) => element.getAttribute('class') ?? '')
    .filter((cls) => HOVER_SHOWN.test(cls) && /\bopacity-0\b/.test(cls) && !PORTRAIT_HINT.test(cls))
    .filter((cls) => {
      const shown = HOVER_SHOWN.exec(cls)?.[1];
      return !cls.split(/\s+/).includes(`[@media(hover:none)]:opacity-${shown}`);
    });
}

describe('the sheets\' hover-only marks', () => {
  it('show where nothing can hover too, in every sheet file', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(40);
    expect(Object.keys(SOURCES).filter((file) => file.includes('/__tests__/'))).toEqual([]);
    const missing = Object.entries(SOURCES).flatMap(([file, source]) =>
      source
        .split('\n')
        .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
        .filter(({ line }) => /\bopacity-0\b/.test(line) && HOVER_SHOWN.test(line) && !PORTRAIT_HINT.test(line))
        .filter(({ line }) => !line.includes(`[@media(hover:none)]:opacity-${HOVER_SHOWN.exec(line)![1]}`))
        .map(({ at }) => at)
    );
    expect(missing).toEqual([]);
  });

  it('show on the 5E sheet\'s abilities, saves, skills, hit dice and attacks', async () => {
    const attack = { name: 'Spear', attackBonus: 4, damageRoll: '1d6+2', damageType: 'piercing', range: 20, properties: [], notes: '' };
    const { container } = render(<FifthEditionCharacterView character={fifthEditionCharacter({ attacks: [attack] })} onRoll={vi.fn()} />);
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBeGreaterThan(20);
    expect(hiddenFromTouch(container)).toEqual([]);
    await userEvent.click(screen.getByRole('tab', { name: 'Combat' }));
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBeGreaterThan(1);
    expect(hiddenFromTouch(container)).toEqual([]);
  });

  it('show on the Fantasy d20 sheet', () => {
    const { container } = render(<FantasyD20CharacterView character={fantasyD20Character()} onRoll={vi.fn()} />);
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBeGreaterThan(20);
    expect(hiddenFromTouch(container)).toEqual([]);
  });

  it('show on the Horror d100 sheet\'s characteristics and skills', async () => {
    const { container } = render(<HorrorD100CharacterView character={horrorD100Character()} onRoll={vi.fn()} />);
    // Seven of the eight characteristics give a roll; SIZ gives none.
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBe(7);
    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBeGreaterThan(20);
    expect(hiddenFromTouch(container)).toEqual([]);
  });
});
