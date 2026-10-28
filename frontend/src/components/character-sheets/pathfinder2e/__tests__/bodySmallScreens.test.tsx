/**
 * The Pathfinder 2e sheet's body on a phone.
 *
 * On a phone about 300 px is left for a tab's content, and the body was laid
 * out for a desk: a save's row put its name, rank, item bonus and total on
 * one line of about 400 px, so the item bonus boxes were cut off at the
 * sheet's edge; labels kept 96 and 128 px beside boxes that never shrank;
 * spell attack and DC, spell slots, coins and an item's numbers kept two to
 * five columns; and headings kept their Add buttons beside them. Below `sm`
 * each now has a layout of its own; from `sm` up the classes that drew the old
 * one are all still there, behind `sm:` where they changed, and a row that
 * wraps on a phone keeps to one line (`sm:flex-nowrap`). A delete button
 * on a row is 44 px on a touch screen. jsdom evaluates no media query, so the
 * classes are asserted; the screenshots show the layout.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import { Pathfinder2eCharacterView } from '../Pathfinder2eCharacterView';
import { pf2eCharacter, PF2E_BLANK_SHEET } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const noop = () => Promise.resolve();
const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

/** The nearest element above `from` whose classes include all of `want`. */
function above(from: Element, want: string[]): Element {
  let at = from.parentElement;
  while (at && !want.every((c) => classes(at).includes(c))) at = at.parentElement;
  if (!at) throw new Error(`nothing above with ${want.join(' ')}`);
  return at;
}

/** A grid that has `phone` columns below sm and `desk` from sm up. */
const columns = (grid: Element, phone: string, desk: string) => {
  expect(classes(grid)).toEqual(expect.arrayContaining(['grid', phone, desk]));
  expect(classes(grid)).not.toContain(desk.replace(/^sm:/, ''));
};

/** A row that wraps on a phone and keeps to one line from sm up, as it did. */
const wraps = (row: Element | null) => {
  expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'sm:flex-nowrap']));
  expect(classes(row).some((c) => /^space-x-/.test(c))).toBe(false);
};

const SPELLCASTING = {
  ...(PF2E_BLANK_SHEET.spellcasting as Record<string, unknown>),
  cantrips: [{ name: 'Shield', rank: 0 }],
  slots: { ...((PF2E_BLANK_SHEET.spellcasting as Record<string, Record<string, unknown>>).slots), 1: { total: 2, expended: 0 } },
  spells: [{ name: 'Magic Missile', rank: 1, prepared: true }],
  focusSpells: { focusPoints: { total: 1, current: 1 }, spells: [{ name: 'Force Bolt', rank: 1 }] },
  innateSpells: [{ name: 'Detect Magic', tradition: 'arcane', frequency: 'at will' }],
  rituals: [{ name: 'Commune', rank: 6 }],
};

const sheet = () =>
  pf2eCharacter({
    loreSkills: [{ name: 'Sailing Lore', attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 3 }],
    strikes: [{ name: 'Longsword', type: 'melee', attackBonus: 5, damageRoll: '1d8', damageType: 'slashing', attributeModifier: 'strength', proficiencyRank: 'trained', itemBonus: 0, traits: [], range: null, notes: '' }],
    spellcasting: SPELLCASTING,
    inventory: [{ name: 'Rope', quantity: 1, bulk: 'L', equipped: false, invested: false, value: 1, notes: '' }],
    classFeatures: [{ name: 'Shield Block', description: '' }],
    feats: { ancestryAndHeritage: [], class: [{ name: 'Power Attack', level: 1, description: '' }], skill: [], general: [], bonus: [] },
    hp: { ...(PF2E_BLANK_SHEET.hp as Record<string, unknown>), resistances: ['fire 5'] },
    deathAndDying: { dying: 1, wounded: 0, doomed: 0 },
    appearance: { age: '30', height: 'Tall' },
  });

async function editorOn(tab?: string) {
  const view = render(<Pathfinder2eCharacterEditor character={sheet()} onSave={noop} onCancel={vi.fn()} />);
  if (tab) await userEvent.click(screen.getByRole('button', { name: tab }));
  return view;
}

describe('the Pathfinder 2e editor on a phone', () => {
  describe('Stats & Skills', () => {
    it('puts a save\'s name and total on the first line, and its rank and item bonus under them', async () => {
      await editorOn();
      const item = screen.getByLabelText('Item bonus to Fortitude saves');
      const row = above(item, ['bg-paper']);
      expect(classes(row)).toEqual(expect.arrayContaining(['grid', 'grid-cols-[minmax(0,1fr)_auto]', 'sm:flex', 'sm:justify-between']));
      const name = screen.getByText('fortitude');
      expect(classes(name.parentElement)).toEqual(expect.arrayContaining(['contents', 'sm:flex', 'sm:space-x-3']));
      const total = row.lastElementChild;
      expect(classes(total)).toEqual(expect.arrayContaining(['col-start-2', 'row-start-1', 'justify-self-end']));
    });

    it('lets Perception\'s item bonus go under its rank', async () => {
      await editorOn();
      const select = screen.getByLabelText('Proficiency in Perception');
      wraps(select.parentElement);
      expect(classes(select.parentElement)).toContain('min-w-0');
      wraps(above(select.parentElement!, ['bg-paper']));
    });

    it('wraps a skill\'s boxes and a lore skill\'s', async () => {
      await editorOn();
      wraps(screen.getByLabelText('Item bonus to Arcana').parentElement);
      wraps(screen.getByLabelText('Item bonus to lore skill 1').parentElement);
      expect(classes(screen.getByLabelText('Name of lore skill 1'))).toContain('min-w-0');
      wraps(screen.getByRole('heading', { name: 'Lore Skills' }).parentElement);
    });
  });

  describe('Combat', () => {
    it('lets the labels beside the boxes take their own width, and the boxes shrink', async () => {
      await editorOn('Combat');
      for (const [label, width] of [['DEX Cap:', 'w-24'], ['Item Bonus:', 'w-24'], ['Key Attribute:', 'w-32'], ['Uses:', 'w-24'], ['Land (ft):', 'w-24']]) {
        const cls = classes(screen.getByText(label));
        expect(cls).toContain(`sm:${width}`);
        expect(cls).not.toContain(width);
      }
      for (const box of ['DEX Cap', 'Armor item bonus', 'Key Attribute', 'Initiative uses', 'Land speed (ft)']) {
        expect(classes(screen.getByLabelText(box))).toContain('min-w-0');
      }
    });

    it('stacks the resistances, immunities and weaknesses, side by side from sm up', async () => {
      await editorOn('Combat');
      columns(above(screen.getByLabelText('Resistances'), ['grid']), 'grid-cols-1', 'sm:grid-cols-3');
    });

    it('lets a strike\'s name shrink, and wraps the Add button under the heading', async () => {
      await editorOn('Combat');
      expect(classes(screen.getByLabelText('Name of strike 1'))).toContain('min-w-0');
      wraps(screen.getByRole('heading', { name: 'Strikes & Attacks' }).parentElement);
    });
  });

  describe('Spells', () => {
    it('stacks the spell attack and DC, side by side from sm up, and lets their boxes shrink', async () => {
      await editorOn('Spells');
      const box = screen.getByLabelText('Spell attack item bonus');
      columns(above(box, ['grid']), 'grid-cols-1', 'sm:grid-cols-2');
      expect(classes(box)).toContain('min-w-0');
      expect(classes(screen.getByLabelText('Spell DC item bonus'))).toContain('min-w-0');
    });

    it('lists the spell slots three to a row, five from sm up and ten from md up', async () => {
      await editorOn('Spells');
      const grid = above(screen.getByLabelText('Rank 1 slots'), ['grid']);
      expect(classes(grid)).toEqual(expect.arrayContaining(['grid-cols-3', 'sm:grid-cols-5', 'md:grid-cols-10']));
      expect(classes(grid)).not.toContain('grid-cols-5');
    });

    it('wraps the focus points and Add Focus Spell under the heading', async () => {
      await editorOn('Spells');
      wraps(screen.getByRole('heading', { name: 'Focus Spells' }).parentElement);
      wraps(screen.getByRole('button', { name: 'Add Focus Spell' }).parentElement);
    });

    it('wraps every list\'s Add button under its heading, and lets the names shrink', async () => {
      await editorOn('Spells');
      for (const name of ['Cantrips', 'Spells Prepared', 'Innate Spells', 'Rituals']) wraps(screen.getByRole('heading', { name }).parentElement);
      for (const box of ['Name of cantrip 1', 'Name of spell 1', 'Name of focus spell 1', 'Name of innate spell 1', 'Name of ritual 1']) {
        expect(classes(screen.getByLabelText(box))).toContain('min-w-0');
      }
    });
  });

  describe('Inventory', () => {
    it('lists the coins two to a row, four from sm up', async () => {
      await editorOn('Inventory');
      columns(above(screen.getByLabelText('Platinum'), ['grid']), 'grid-cols-2', 'sm:grid-cols-4');
    });

    it('lists an item\'s numbers two to a row, four from sm up, and lets its name shrink', async () => {
      await editorOn('Inventory');
      columns(screen.getByLabelText('Quantity of item 1').parentElement!, 'grid-cols-2', 'sm:grid-cols-4');
      expect(classes(screen.getByLabelText('Name of item 1'))).toContain('min-w-0');
      wraps(screen.getByRole('heading', { name: 'Inventory Items' }).parentElement);
    });
  });

  describe('Feats & Features', () => {
    it('puts a feat\'s name on a line of its own, and its level and delete button under it', async () => {
      await editorOn('Feats & Features');
      const name = screen.getByLabelText('Name of class feat 1');
      expect(classes(name)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1', 'basis-full', 'sm:basis-0']));
      expect(classes(name.parentElement)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-2', 'sm:flex-nowrap']));
      const level = screen.getByLabelText('Level of class feat 1').parentElement;
      expect(classes(level)).toContain('sm:ml-2');
      expect(classes(level)).not.toContain('ml-2');
    });

    it('lets a class feature\'s name shrink, and wraps every Add button under its heading', async () => {
      await editorOn('Feats & Features');
      expect(classes(screen.getByLabelText('Class feature 1 name'))).toContain('min-w-0');
      for (const name of ['Class Features', 'Ancestry & Heritage Feats', 'Class Feats', 'Skill Feats', 'General Feats', 'Bonus Feats']) {
        wraps(screen.getByRole('heading', { name }).parentElement);
      }
    });
  });

  it.each(['Stats & Skills', 'Combat', 'Spells', 'Inventory', 'Feats & Features'])('sizes the delete buttons for a finger on %s', async (tab) => {
    await editorOn(tab === 'Stats & Skills' ? undefined : tab);
    const deletes = screen.getAllByRole('button').filter((button) => classes(button).includes('hover:bg-danger/10'));
    expect(deletes.length).toBeGreaterThan(0);
    for (const button of deletes) expect(classes(button)).toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
  });
});

describe('the Pathfinder 2e sheet on a phone', () => {
  const show = () => render(<Pathfinder2eCharacterView character={sheet()} />);

  it('stacks the resistances, immunities and weaknesses, side by side from sm up', () => {
    show();
    columns(above(screen.getByText('Resistances:'), ['grid']), 'grid-cols-1', 'sm:grid-cols-3');
  });

  it('wraps Dying, Wounded and Doomed, and the coins', () => {
    show();
    wraps(above(screen.getByText('Dying:'), ['flex', 'text-sm']));
    const currency = screen.getByText('Currency').parentElement!.parentElement;
    wraps(currency);
    wraps(currency!.lastElementChild);
  });

  it('stacks the tradition, type and key attribute, and the spell attack and DC', () => {
    show();
    columns(above(screen.getByText('Tradition'), ['grid']), 'grid-cols-1', 'sm:grid-cols-3');
    columns(above(screen.getByText('Spell Attack'), ['grid']), 'grid-cols-1', 'sm:grid-cols-2');
  });

  it('lists the spell slots three to a row, and five from sm up', () => {
    show();
    columns(screen.getByRole('heading', { name: 'Spell Slots' }).nextElementSibling!, 'grid-cols-3', 'sm:grid-cols-5');
  });

  it('lists the appearance two to a row, and three from sm up', () => {
    show();
    columns(above(screen.getByText('Age:'), ['grid']), 'grid-cols-2', 'sm:grid-cols-3');
  });

  it('wraps the bulk carried beside its badge, and an item\'s name beside its tags', () => {
    show();
    wraps(screen.getByText('Bulk Carried').parentElement!.parentElement);
    wraps(screen.getByText('Rope').parentElement);
  });
});
