/**
 * Who a roll from the dice panel is made as and what it is for.
 *
 * The Character box wins whenever it holds something; a saved roll's own
 * character fills it only while it is empty. A saved roll's purpose is its
 * own, or its name, whatever the Purpose box holds.
 */

import { describe, it, expect } from 'vitest';
import { rollLabels, savedRollDetail } from '../savedRolls';

const goblin = { name: 'Goblin', characterName: 'Goblin boss', purpose: 'Scimitar attack' };
const longsword = { name: 'Longsword', characterName: null, purpose: null };
const empty = { characterName: '', purpose: '' };

describe('rollLabels', () => {
  it('takes a typed roll from the boxes, trimmed', () => {
    expect(rollLabels({ characterName: ' Aria ', purpose: ' Perception ' })).toEqual({ characterName: 'Aria', purpose: 'Perception' });
  });

  it('makes a saved roll as its own character, for its own purpose, while the box is empty', () => {
    expect(rollLabels(empty, goblin)).toEqual({ characterName: 'Goblin boss', purpose: 'Scimitar attack' });
  });

  it('lets the Character box win when it has something in it', () => {
    expect(rollLabels({ characterName: 'Grik', purpose: '' }, goblin)).toEqual({ characterName: 'Grik', purpose: 'Scimitar attack' });
  });

  it('takes a box of only spaces as empty', () => {
    expect(rollLabels({ characterName: '   ', purpose: '' }, goblin).characterName).toBe('Goblin boss');
  });

  it('sends a saved roll without a purpose for its name, and leaves the Purpose box out', () => {
    expect(rollLabels({ characterName: '', purpose: 'Typed' }, longsword)).toEqual({ characterName: '', purpose: 'Longsword' });
    expect(rollLabels({ characterName: '', purpose: 'Typed' }, goblin).purpose).toBe('Scimitar attack');
  });
});

describe('savedRollDetail', () => {
  it('says who and what for, or the half it has, or nothing', () => {
    expect(savedRollDetail(goblin)).toBe('as Goblin boss, for Scimitar attack');
    expect(savedRollDetail({ characterName: 'Grik', purpose: null })).toBe('as Grik');
    expect(savedRollDetail({ characterName: null, purpose: 'Initiative' })).toBe('for Initiative');
    expect(savedRollDetail(longsword)).toBe('');
  });
});
