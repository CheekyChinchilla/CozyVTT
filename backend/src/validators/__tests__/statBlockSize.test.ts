/**
 * A stat block has a size limit.
 *
 * Unknown keys pass through a stat block so older stored ones survive a
 * round trip, and nothing bounded them: a token could carry a megabyte under
 * one made-up key, every token on a map is one JSON column, and every drag
 * of any token on that map read the whole column back. A stat block is now
 * held to 64 KB as stored, with at most 20 keys the schema does not name.
 *
 * The largest SRD 5.1 creature the Creature Library seeds is the Vampire, at
 * about 6,000 characters as stored, so the limit is ten times that. The
 * blocks below are built to its shape (six traits, five actions, three
 * legendary actions, with its description lengths) out of filler text.
 */

import { NpcStatBlockSchema } from '../statBlock';

const LIMIT = 64 * 1024;

const filler = (length: number) => 'The creature does something. '.repeat(Math.ceil(length / 29)).slice(0, length);
const entries = (lengths: number[], scale: number) =>
  lengths.map((length, i) => ({ name: `Entry ${i + 1}`, description: filler(length * scale) }));

/** A stat block shaped like the SRD Vampire, with every description `scale` times as long. */
function vampireShaped(scale = 1) {
  return {
    ac: 16, hpMax: 144, hitDice: '17d8+68', speed: '30 ft.',
    abilities: { str: 18, dex: 18, con: 18, int: 17, wis: 15, cha: 18 },
    savingThrows: { dex: 9, wis: 7, cha: 9 },
    skills: { perception: 7, stealth: 9 },
    damageResistances: filler(71), senses: filler(43), languages: filler(31),
    challengeRating: '13', xp: 10000,
    traits: entries([924, 70, 606, 261, 118, 604], scale),
    actions: entries([70, 173, 614, 808, 361], scale),
    legendaryActions: entries([72, 37, 34], scale),
    creatureType: 'Medium undead (shapechanger)', alignment: 'lawful evil', gameSystem: 'DND_5E',
  };
}

describe('stat block size', () => {
  it('takes a stat block the size of the largest SRD creature', () => {
    const block = vampireShaped();
    expect(JSON.stringify(block).length).toBeGreaterThan(5500);
    expect(NpcStatBlockSchema.safeParse(block).success).toBe(true);
  });

  it('takes one five times that size', () => {
    expect(NpcStatBlockSchema.safeParse(vampireShaped(5)).success).toBe(true);
  });

  it('refuses one past the limit, saying why', () => {
    // Twenty actions of 3,500 characters: each within the per-entry limits.
    const block = { ...vampireShaped(), actions: entries(Array(20).fill(3500), 1) };
    expect(JSON.stringify(block).length).toBeGreaterThan(LIMIT);
    const result = NpcStatBlockSchema.safeParse(block);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/too large/);
  });

  it('refuses a megabyte under a key the schema does not name', () => {
    expect(NpcStatBlockSchema.safeParse({ ...vampireShaped(), junk: 'x'.repeat(990000) }).success).toBe(false);
  });

  it('keeps up to 20 keys it does not name, and refuses a 21st', () => {
    const extra = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`legacy${i}`, i]));
    const kept = NpcStatBlockSchema.safeParse({ ...vampireShaped(), ...extra(20) });
    expect(kept.success).toBe(true);
    expect(kept.data).toMatchObject({ legacy19: 19 });
    expect(NpcStatBlockSchema.safeParse({ ...vampireShaped(), ...extra(21) }).success).toBe(false);
  });
});
