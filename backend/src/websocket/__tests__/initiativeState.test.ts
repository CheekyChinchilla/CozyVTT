/**
 * The initiative order as one recipient may see it.
 *
 * Entries follow their tokens. A player is given only the combatants whose
 * token they were sent at all, with the name, picture and hit points exactly
 * as that token was sent to them; the DM gets every combatant with the token
 * as it is now. No database: the recipient's token list is an input.
 */

import { projectCombatState, sortCombatants, removeCombatants, getState, setState, type CombatState, type CombatantEntry } from '../initiativeState';

const hp = (current: number) => ({ current, max: 10, temp: 0 });
const entry = (tokenId: string, extra: Partial<CombatantEntry> = {}): CombatantEntry => ({
  tokenId, mapId: 'map-1', name: `stored ${tokenId}`, imageUrl: '', initiative: 10, hp: hp(10),
  type: 'npc', disposition: 'hostile', ...extra,
});
const token = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `live ${id}`, imageUrl: `/${id}.png`, ...extra });

describe('projectCombatState', () => {
  const state: CombatState = {
    active: true, round: 2, currentTokenId: 'hidden',
    combatants: [entry('hero'), entry('goblin'), entry('hidden')],
  };

  it('shows a player only the combatants whose token they were sent, as they were sent it', () => {
    // The recipient's list has been through the role filter already: the
    // hidden token is absent and the goblin's hit points were stripped.
    const sent = new Map([['hero', token('hero', { hp: hp(3) })], ['goblin', token('goblin')]]);
    const seen = projectCombatState(state, sent, false);
    expect(seen.combatants.map((c) => c.tokenId)).toEqual(['hero', 'goblin']);
    expect(seen.combatants[0].hp).toEqual(hp(3));
    expect(seen.combatants[0].name).toBe('live hero');
    expect(seen.combatants[0].imageUrl).toBe('/hero.png');
    expect(seen.combatants[1].hp).toBeNull();
  });

  it('drops the turn pointer with the combatant it pointed at', () => {
    const sent = new Map([['hero', token('hero')]]);
    expect(projectCombatState(state, sent, false).currentTokenId).toBeNull();
    expect(projectCombatState({ ...state, currentTokenId: 'hero' }, sent, false).currentTokenId).toBe('hero');
  });

  it('gives the DM every combatant with the token as it is now, and the stored copy when the token is gone', () => {
    const all = new Map([['hero', token('hero', { hp: hp(3) })], ['goblin', token('goblin', { hp: hp(7) })]]);
    const seen = projectCombatState(state, all, true);
    expect(seen.combatants.map((c) => c.tokenId)).toEqual(['hero', 'goblin', 'hidden']);
    expect(seen.combatants[1].hp).toEqual(hp(7));
    expect(seen.combatants[2].hp).toEqual(hp(10));
    expect(seen.combatants[2].name).toBe('stored hidden');
    expect(seen.currentTokenId).toBe('hidden');
  });

  it('keeps the round, the active flag and the order, and leaves the stored state untouched', () => {
    const before = JSON.stringify(state);
    const seen = projectCombatState(state, new Map([['goblin', token('goblin')], ['hero', token('hero')]]), false);
    expect(seen.active).toBe(true);
    expect(seen.round).toBe(2);
    expect(seen.combatants.map((c) => c.tokenId)).toEqual(['hero', 'goblin']);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('sortCombatants', () => {
  it('orders by initiative, highest first, with the unrolled last', () => {
    const sorted = sortCombatants([entry('a', { initiative: null }), entry('b', { initiative: 5 }), entry('c', { initiative: 20 })]);
    expect(sorted.map((c) => c.tokenId)).toEqual(['c', 'b', 'a']);
  });

  it('keeps the order combatants were added in when initiatives tie or are unrolled', () => {
    // A tie broken by name would tell a player where an obscured combatant's
    // real name falls in the alphabet. The order of adding says nothing.
    const tied = [entry('z', { name: 'Zombie', initiative: 12 }), entry('a', { name: 'Aboleth', initiative: 12 })];
    expect(sortCombatants(tied).map((c) => c.tokenId)).toEqual(['z', 'a']);
    const unrolled = [entry('z', { name: 'Zombie', initiative: null }), entry('a', { name: 'Aboleth', initiative: null })];
    expect(sortCombatants(unrolled).map((c) => c.tokenId)).toEqual(['z', 'a']);
  });

  it('returns a new array and leaves the stored one as it was', () => {
    const stored = [entry('b', { initiative: 5 }), entry('c', { initiative: 20 })];
    const sorted = sortCombatants(stored);
    expect(sorted).not.toBe(stored);
    expect(stored.map((c) => c.tokenId)).toEqual(['b', 'c']);
  });
});

describe('removeCombatants', () => {
  const combatant = (tokenId: string) => ({
    tokenId, mapId: 'm', name: tokenId, imageUrl: '', initiative: 10, hp: null, type: 'npc' as const, disposition: null,
  });

  it('drops the named entries and keeps the fight going while any remain', () => {
    setState('c-remove-1', { active: true, round: 2, currentTokenId: 'a', combatants: [combatant('a'), combatant('b')] });
    expect(removeCombatants('c-remove-1', (e) => e.tokenId === 'b')).toBe(true);
    expect(getState('c-remove-1')).toMatchObject({ active: true, round: 2, currentTokenId: 'a' });
    expect(getState('c-remove-1').combatants.map((c) => c.tokenId)).toEqual(['a']);
  });

  // With nothing left the fight cannot go on or be ended: the tracker only
  // draws Next Turn and End Combat beside a combatant, and the server refuses
  // Next and Start on an empty order. Deleting the last combatant's token, or
  // the map they were all on, left the table in "Round N" until a restart.
  it('ends the fight when the last combatant is removed', () => {
    setState('c-remove-2', { active: true, round: 3, currentTokenId: 'a', combatants: [combatant('a')] });
    expect(removeCombatants('c-remove-2', () => true)).toBe(true);
    expect(getState('c-remove-2')).toEqual({ active: false, round: 0, currentTokenId: null, combatants: [] });
  });
});
