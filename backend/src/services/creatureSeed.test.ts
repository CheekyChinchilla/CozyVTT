/**
 * Creature Seeding — Unit Tests
 *
 * Covers the hit-point mapping from Open5e and the backfill that adds HP to
 * SRD stat blocks stored before hit points were tracked.
 */

import { transformMonster, backfillStatBlockHp } from './creatureSeed';

/** Minimal Open5e monster — only the fields the transform reads. */
const goblin = {
  slug: 'goblin',
  name: 'Goblin',
  size: 'Small',
  type: 'humanoid',
  subtype: 'goblinoid',
  group: null,
  alignment: 'neutral evil',
  armor_class: 15,
  armor_desc: 'leather armor, shield',
  hit_points: 7,
  hit_dice: '2d6',
  speed: { walk: 30 },
  strength: 8,
  dexterity: 14,
  constitution: 10,
  intelligence: 10,
  wisdom: 8,
  charisma: 8,
  strength_save: null,
  dexterity_save: null,
  constitution_save: null,
  intelligence_save: null,
  wisdom_save: null,
  charisma_save: null,
  skills: { stealth: 6 },
  senses: 'darkvision 60 ft., passive Perception 9',
  languages: 'Common, Goblin',
  challenge_rating: '1/4',
  cr: 0.25,
  actions: null,
  bonus_actions: null,
  reactions: null,
  special_abilities: null,
  legendary_desc: '',
  legendary_actions: null,
  damage_vulnerabilities: '',
  damage_resistances: '',
  damage_immunities: '',
  condition_immunities: '',
  document__slug: 'wotc-srd',
  document__title: 'Systems Reference Document',
} as unknown as Parameters<typeof transformMonster>[0];

// ============================================
// transformMonster
// ============================================

describe('transformMonster', () => {
  it('maps Open5e hit points and hit dice into the stat block', () => {
    const { statBlock } = transformMonster(goblin);

    expect(statBlock.hpMax).toBe(7);
    expect(statBlock.hitDice).toBe('2d6');
  });

  it('omits hit dice when Open5e provides none', () => {
    const { statBlock } = transformMonster({ ...goblin, hit_dice: '' });

    expect(statBlock.hpMax).toBe(7);
    expect(statBlock.hitDice).toBeUndefined();
  });

  it('still maps the rest of the stat block', () => {
    const { statBlock } = transformMonster(goblin);

    expect(statBlock.ac).toBe(15);
    expect(statBlock.speed).toBe('30 ft.');
    expect(statBlock.abilities.dex).toBe(14);
  });
});

// ============================================
// backfillStatBlockHp
// ============================================

describe('backfillStatBlockHp', () => {
  it('adds hit points to a stat block that has none', () => {
    const result = backfillStatBlockHp({ ac: 15, speed: '30 ft.' }, 7, '2d6');

    expect(result).toEqual({ ac: 15, speed: '30 ft.', hpMax: 7, hitDice: '2d6' });
  });

  it('leaves every other key untouched', () => {
    const existing = {
      ac: 15,
      speed: '30 ft.',
      actions: [{ name: 'Scimitar', description: 'Melee attack' }],
      notes: 'DM-curated text',
    };

    const result = backfillStatBlockHp(existing, 7, '2d6');

    expect(result!.actions).toEqual(existing.actions);
    expect(result!.notes).toBe('DM-curated text');
  });

  it('returns null when the stat block already has hit points', () => {
    expect(backfillStatBlockHp({ ac: 15, hpMax: 42 }, 7, '2d6')).toBeNull();
  });

  it('keeps existing hit dice rather than overwriting them', () => {
    const result = backfillStatBlockHp({ ac: 15, hitDice: '3d6' }, 7, '2d6');

    expect(result!.hitDice).toBe('3d6');
    expect(result!.hpMax).toBe(7);
  });

  it('returns null for unusable stat blocks', () => {
    expect(backfillStatBlockHp(null, 7)).toBeNull();
    expect(backfillStatBlockHp(undefined, 7)).toBeNull();
    expect(backfillStatBlockHp('not an object', 7)).toBeNull();
    expect(backfillStatBlockHp([], 7)).toBeNull();
  });
});
