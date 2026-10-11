/**
 * The Pathfinder 2e editor stops adding to a list where the server stops
 * keeping it, and holds item bonuses and spell slots to what the server takes.
 *
 * The server refuses a sheet whose lists hold more than the list limit, whose
 * item bonus is outside -30 to 30, or whose slot total is over 20, so a box
 * that let the player go past made a sheet that could be filled in and not
 * saved. Here both list limits are two, so two rows fill a list.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import { PF2E_BLANK_SHEET, pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/constants/sheetLimits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/constants/sheetLimits')>()),
  SHEET_LIST_MAX: 2,
  SHEET_ROW_TAGS_MAX: 2,
}));

const FULL = /This list is full: a sheet holds at most 2 entries here/;

function open(tab: string, overrides: Record<string, unknown>) {
  render(<Pathfinder2eCharacterEditor character={pf2eCharacter(overrides)} onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: tab }));
}

const spellcasting = (fields: Record<string, unknown>) => ({
  ...(PF2E_BLANK_SHEET.spellcasting as Record<string, unknown>),
  ...fields,
});
const lore = (name: string) => ({ name, attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 0 });
const strike = (name: string) => ({
  name, type: 'melee', attackBonus: 0, damageRoll: '1d6', damageType: 'slashing', attributeModifier: 'strength',
  proficiencyRank: 'trained', itemBonus: 0, traits: [], range: null, notes: '',
});
const cantrip = (name: string) => ({ rank: 1, name, prepared: true });
const spell = (name: string) => ({ rank: 1, name, prepared: false, ritual: false, heightened: false });
const innate = (name: string) => ({ name, tradition: 'arcane', frequency: 'at will' });
const ritual = (name: string) => ({ name, rank: 1 });
const item = (name: string) => ({ name, quantity: 1, bulk: 'L', equippable: false, equipped: false, requiresAttunement: false, attuned: false, invested: false, value: 0, notes: '' });
const feature = (name: string) => ({ name, description: '' });
const feat = (name: string) => ({ name, level: 1, description: '' });
const two = <T,>(make: (name: string) => T): T[] => [make('One'), make('Two')];
const one = <T,>(make: (name: string) => T): T[] => [make('One')];

describe.each([
  ['lore skills', 'Stats & Skills', 'Add Lore', { loreSkills: two(lore) }, { loreSkills: one(lore) }],
  ['strikes', 'Combat', 'Add Strike', { strikes: two(strike) }, { strikes: one(strike) }],
  ['cantrips', 'Spells', 'Add Cantrip', { spellcasting: spellcasting({ cantrips: two(cantrip) }) }, { spellcasting: spellcasting({ cantrips: one(cantrip) }) }],
  ['spells', 'Spells', 'Add Spell', { spellcasting: spellcasting({ spells: two(spell) }) }, { spellcasting: spellcasting({ spells: one(spell) }) }],
  [
    'focus spells', 'Spells', 'Add Focus Spell',
    { spellcasting: spellcasting({ focusSpells: { focusPoints: { total: 1, current: 1 }, spells: two(spell) } }) },
    { spellcasting: spellcasting({ focusSpells: { focusPoints: { total: 1, current: 1 }, spells: one(spell) } }) },
  ],
  ['innate spells', 'Spells', 'Add Innate Spell', { spellcasting: spellcasting({ innateSpells: two(innate) }) }, { spellcasting: spellcasting({ innateSpells: one(innate) }) }],
  ['rituals', 'Spells', 'Add Ritual', { spellcasting: spellcasting({ rituals: two(ritual) }) }, { spellcasting: spellcasting({ rituals: one(ritual) }) }],
  ['inventory', 'Inventory', 'Add Item', { inventory: two(item) }, { inventory: one(item) }],
  ['class features', 'Feats & Features', 'Add Feature', { classFeatures: two(feature) }, { classFeatures: one(feature) }],
])('the %s list', (_list, tab, button, full, room) => {
  it('turns its add button off at the limit, and says why', () => {
    open(tab, full);
    expect(screen.getByRole('button', { name: button })).toBeDisabled();
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it('keeps its add button on while there is room', () => {
    open(tab, room);
    expect(screen.getByRole('button', { name: button })).toBeEnabled();
    expect(screen.queryByText(FULL)).toBeNull();
  });
});

describe('the feat lists', () => {
  const categories = ['ancestryAndHeritage', 'class', 'skill', 'general', 'bonus'] as const;

  it.each(categories.map((key, index) => [key, index] as const))('%s turns only its own add button off', (key, index) => {
    open('Feats & Features', { feats: { ...(PF2E_BLANK_SHEET.feats as object), [key]: two(feat) } });
    const buttons = screen.getAllByRole('button', { name: 'Add Feat' });

    expect(buttons).toHaveLength(5);
    buttons.forEach((button, at) => (at === index ? expect(button).toBeDisabled() : expect(button).toBeEnabled()));
    expect(screen.getAllByText(FULL)).toHaveLength(1);
  });
});

describe('the comma-separated boxes', () => {
  const boxes: Array<[string, string, string, Record<string, unknown>]> = [
    ['senses', 'Stats & Skills', 'low-light vision, darkvision 60 ft.', { perception: { ...(PF2E_BLANK_SHEET.perception as object), senses: ['a', 'b'] } }],
    ['other speeds', 'Combat', 'fly 30 ft., swim 20 ft.', { speed: { land: 25, other: ['a', 'b'] } }],
    ['resistances', 'Combat', 'fire 5', { hp: { ...(PF2E_BLANK_SHEET.hp as object), resistances: ['a', 'b'] } }],
    ['immunities', 'Combat', 'poison', { hp: { ...(PF2E_BLANK_SHEET.hp as object), immunities: ['a', 'b'] } }],
    ['weaknesses', 'Combat', 'cold 5', { hp: { ...(PF2E_BLANK_SHEET.hp as object), weaknesses: ['a', 'b'] } }],
    ['conditions', 'Combat', 'frightened, sickened, etc.', { conditions: ['a', 'b'] }],
    ['languages', 'Biography', 'Common, Elven, Draconic', { languages: ['a', 'b'] }],
    ['strike traits', 'Combat', 'Traits (comma-separated)', { strikes: [{ ...strike('Sword'), traits: ['agile', 'finesse'] }] }],
  ];

  it.each(boxes)('%s does not take a third entry, and says why', (_name, tab, placeholder, overrides) => {
    open(tab, overrides);
    const box = screen.getByPlaceholderText(placeholder) as HTMLInputElement;
    const before = box.value;

    fireEvent.change(box, { target: { value: `${before}, extra` } });

    expect(box.value).toBe(before);
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });
});

describe('item bonuses', () => {
  /** The number box beside a label such as "Item:". */
  const boxBeside = (label: string, at = 0) =>
    within(screen.getAllByText(label)[at].parentElement as HTMLElement).getByRole('spinbutton') as HTMLInputElement;

  it('stop at -30 and 30 in a saving throw', () => {
    open('Stats & Skills', {});
    const fortitude = boxBeside('Item:');
    expect(fortitude).toHaveAttribute('max', '30');
    expect(fortitude).toHaveAttribute('min', '-30');

    fireEvent.change(fortitude, { target: { value: '99' } });
    fireEvent.blur(fortitude);
    expect(fortitude).toHaveValue(30);
    fireEvent.change(fortitude, { target: { value: '-99' } });
    fireEvent.blur(fortitude);
    expect(fortitude).toHaveValue(-30);
  });

  it('stop at -30 and 30 in a skill and a lore skill', () => {
    open('Stats & Skills', { loreSkills: one(lore) });
    const items = screen.getAllByPlaceholderText('Item') as HTMLInputElement[];

    expect(items.length).toBeGreaterThan(16);
    for (const box of items) {
      expect(box).toHaveAttribute('max', '30');
      expect(box).toHaveAttribute('min', '-30');
    }
  });

  it('stop at -30 and 30 in armor class', () => {
    open('Combat', {});
    expect(boxBeside('Item Bonus:')).toHaveAttribute('max', '30');
  });

  it('stop at -30 and 30 in the spell attack and the spell DC', () => {
    open('Spells', {});
    for (const at of [0, 1]) {
      expect(boxBeside('Item Bonus:', at)).toHaveAttribute('max', '30');
      expect(boxBeside('Item Bonus:', at)).toHaveAttribute('min', '-30');
    }
  });
});

describe('spell slots', () => {
  it('stop at 20 a rank', () => {
    open('Spells', {});
    const totals = screen.getAllByPlaceholderText('Total');
    expect(totals).toHaveLength(10);
    expect(totals[0]).toHaveAttribute('max', '20');
  });
});
