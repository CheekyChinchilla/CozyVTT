/**
 * Every button in a sheet editor has a name a screen reader can say.
 *
 * The buttons that remove a D&D 5e attack, spell or inventory item showed
 * "×" and were announced as "times"; most of the Pathfinder 2e editor's
 * remove buttons showed only a bin and were announced as "button". Each now
 * names its row, as the class feature and hit dice rows already did.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../dnd5e/DnD5eCharacterEditor';
import { Pathfinder2eCharacterEditor } from '../pathfinder2e/Pathfinder2eCharacterEditor';
import { CallOfCthulhu7eCharacterEditor } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const noop = () => Promise.resolve();

const unnamed = (name: string) => name.trim() === '' || name.trim() === '×';

/**
 * The buttons on every tab with no name, or one a symbol stands for, once
 * each list on the tab has a row (each Add button pressed once).
 */
function unnamedButtons(): string[] {
  const found: string[] = [];
  for (const tab of screen.getAllByRole('tab')) {
    fireEvent.click(tab);
    for (const add of screen.queryAllByRole('button', { name: /^\+? ?Add\b/ })) fireEvent.click(add);
    for (const button of screen.queryAllByRole('button', { name: unnamed })) {
      found.push(`${tab.textContent}: ${button.outerHTML.slice(0, 140)}`);
    }
  }
  return found;
}

describe.each([
  ['D&D 5e', () => render(<DnD5eCharacterEditor character={dnd5eCharacter()} onSave={noop} onCancel={vi.fn()} />)],
  ['Pathfinder 2e', () => render(<Pathfinder2eCharacterEditor character={pf2eCharacter()} onSave={noop} onCancel={vi.fn()} />)],
  ['Call of Cthulhu', () => render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={noop} onCancel={vi.fn()} />)],
])('the %s editor', (_system, show) => {
  it('names every button on every tab', () => {
    show();
    expect(unnamedButtons()).toEqual([]);
  });
});
