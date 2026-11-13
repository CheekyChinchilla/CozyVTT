/**
 * Every button in a sheet editor has a name a screen reader can say.
 *
 * The buttons that remove a 5E attack, spell or inventory item showed
 * "×" and were announced as "times"; most of the Fantasy d20 editor's
 * remove buttons showed only a bin and were announced as "button". Each now
 * names its row, as the class feature and hit dice rows already did.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FifthEditionCharacterEditor } from '../fifth-edition/FifthEditionCharacterEditor';
import { FantasyD20CharacterEditor } from '../fantasy-d20/FantasyD20CharacterEditor';
import { HorrorD100CharacterEditor } from '../horror-d100/HorrorD100CharacterEditor';
import { fifthEditionCharacter } from '../fifth-edition/__tests__/fifthEditionFixture';
import { fantasyD20Character } from '../fantasy-d20/__tests__/fantasyD20Fixture';
import { horrorD100Character } from '../horror-d100/__tests__/sheetFixture';

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
  ['5E', () => render(<FifthEditionCharacterEditor character={fifthEditionCharacter()} onSave={noop} onCancel={vi.fn()} />)],
  ['Fantasy d20', () => render(<FantasyD20CharacterEditor character={fantasyD20Character()} onSave={noop} onCancel={vi.fn()} />)],
  ['Horror d100', () => render(<HorrorD100CharacterEditor character={horrorD100Character()} onSave={noop} onCancel={vi.fn()} />)],
])('the %s editor', (_system, show) => {
  it('names every button on every tab', () => {
    show();
    expect(unnamedButtons()).toEqual([]);
  });
});
