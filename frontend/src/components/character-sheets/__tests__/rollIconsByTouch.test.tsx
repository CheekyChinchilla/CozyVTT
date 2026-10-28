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
import { DnD5eCharacterView } from '../dnd5e/DnD5eCharacterView';
import { Pathfinder2eCharacterView } from '../pathfinder2e/Pathfinder2eCharacterView';
import { CallOfCthulhu7eCharacterView } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterView';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';

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

/** Elements in `root` shown only under a hover, whose touch screen form is missing. */
function hiddenFromTouch(root: Element): string[] {
  return [...root.querySelectorAll('[class*="group-hover:opacity-"]')]
    .map((element) => element.getAttribute('class') ?? '')
    .filter((cls) => /\bopacity-0\b/.test(cls) && !PORTRAIT_HINT.test(cls))
    .filter((cls) => {
      const shown = /group-hover:opacity-(\d+)/.exec(cls)?.[1];
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
        .filter(({ line }) => /\bopacity-0\b/.test(line) && /group-hover:opacity-\d+/.test(line) && !PORTRAIT_HINT.test(line))
        .filter(({ line }) => !line.includes(`[@media(hover:none)]:opacity-${/group-hover:opacity-(\d+)/.exec(line)![1]}`))
        .map(({ at }) => at)
    );
    expect(missing).toEqual([]);
  });

  it('show on the D&D 5e sheet\'s abilities, saves, skills, hit dice and attacks', async () => {
    const attack = { name: 'Spear', attackBonus: 4, damageRoll: '1d6+2', damageType: 'piercing', range: 20, properties: [], notes: '' };
    const { container } = render(<DnD5eCharacterView character={dnd5eCharacter({ attacks: [attack] })} onRoll={vi.fn()} />);
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBeGreaterThan(20);
    expect(hiddenFromTouch(container)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Combat' }));
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBeGreaterThan(1);
    expect(hiddenFromTouch(container)).toEqual([]);
  });

  it('show on the Pathfinder 2e sheet', () => {
    const { container } = render(<Pathfinder2eCharacterView character={pf2eCharacter()} onRoll={vi.fn()} />);
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBeGreaterThan(20);
    expect(hiddenFromTouch(container)).toEqual([]);
  });

  it('show on the Call of Cthulhu sheet\'s characteristics and skills', async () => {
    const { container } = render(<CallOfCthulhu7eCharacterView character={cocCharacter()} onRoll={vi.fn()} />);
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBe(8);
    await userEvent.click(screen.getByRole('button', { name: 'Skills' }));
    expect(container.querySelectorAll('[class*="[@media(hover:none)]:opacity-"]').length).toBeGreaterThan(20);
    expect(hiddenFromTouch(container)).toEqual([]);
  });
});
