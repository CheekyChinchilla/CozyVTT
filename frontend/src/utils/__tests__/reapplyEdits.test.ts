/**
 * Carrying a refused save's changes onto the newest version of a character.
 *
 * A save made from a version that has since changed is refused, so that it
 * cannot put back what changed. What the user changed is the difference
 * between the version their editor opened and what they tried to save; that
 * difference is put onto the newest version, and where the same field changed
 * in both, they choose.
 */

import { describe, it, expect } from 'vitest';
import { reapplyEdits, withChoices, describePath, describeValue } from '../reapplyEdits';

type Sheet = Record<string, unknown>;

const opened: Sheet = {
  characterName: 'Aldra',
  hp: { maximum: 12, current: 12, temporary: 0 },
  backstory: '',
  inventory: [
    { name: 'Rope', quantity: 1 },
    { name: 'Torch', quantity: 2 },
  ],
  hitDice: [{ class: 'Fighter', die: 'd10', remaining: 1 }],
  features: ['Second Wind'],
};

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('reapplyEdits', () => {
  it('puts the changes onto the newest version, keeping what changed there', () => {
    const edited = { ...copy(opened), backstory: 'Raised by wolves' };
    const latest = { ...copy(opened), hp: { maximum: 12, current: 7, temporary: 0 } };

    const result = reapplyEdits(opened, edited, latest);

    expect(result.merged).toEqual({ ...copy(opened), backstory: 'Raised by wolves', hp: { maximum: 12, current: 7, temporary: 0 } });
    expect(result.applied).toEqual([{ path: ['backstory'], mine: 'Raised by wolves' }]);
    expect(result.conflicts).toEqual([]);
  });

  it('reports a field changed on both sides, and keeps the newer one until told otherwise', () => {
    const edited = { ...copy(opened), hp: { maximum: 12, current: 10, temporary: 0 }, backstory: 'Raised by wolves' };
    const latest = { ...copy(opened), hp: { maximum: 12, current: 7, temporary: 0 } };

    const result = reapplyEdits(opened, edited, latest);

    expect(result.conflicts).toEqual([{ path: ['hp', 'current'], mine: 10, theirs: 7 }]);
    expect(result.applied).toEqual([{ path: ['backstory'], mine: 'Raised by wolves' }]);
    expect((result.merged as { hp: { current: number } }).hp.current).toBe(7);
    expect((withChoices(result, [true]) as { hp: { current: number } }).hp.current).toBe(10);
    expect((withChoices(result, [false]) as { hp: { current: number } }).hp.current).toBe(7);
    // Choosing never changes the result it was given.
    expect((result.merged as { hp: { current: number } }).hp.current).toBe(7);
  });

  it('follows list entries by position while no list has grown or shrunk', () => {
    const edited = copy(opened);
    (edited.inventory as { quantity: number }[])[1].quantity = 5;
    const latest = copy(opened);
    (latest.inventory as { name: string }[])[0].name = 'Silk rope';
    (latest.hitDice as { remaining: number }[])[0].remaining = 0;

    const result = reapplyEdits(opened, edited, latest);

    expect(result.merged).toEqual({
      ...copy(opened),
      inventory: [{ name: 'Silk rope', quantity: 1 }, { name: 'Torch', quantity: 5 }],
      hitDice: [{ class: 'Fighter', die: 'd10', remaining: 0 }],
    });
    expect(result.applied).toEqual([{ path: ['inventory', 1, 'quantity'], mine: 5 }]);
    expect(result.conflicts).toEqual([]);
  });

  it('takes a whole list the user added to, when it did not change elsewhere', () => {
    const edited = copy(opened);
    (edited.inventory as unknown[]).push({ name: 'Lantern', quantity: 1 });
    const latest = { ...copy(opened), hp: { maximum: 12, current: 7, temporary: 0 } };

    const result = reapplyEdits(opened, edited, latest);

    expect((result.merged as { inventory: unknown[] }).inventory).toEqual(edited.inventory);
    expect(result.applied).toEqual([{ path: ['inventory'], mine: edited.inventory }]);
    expect(result.conflicts).toEqual([]);
  });

  it('asks about a list whose length changed on both sides, rather than guess which entry is which', () => {
    const edited = copy(opened);
    (edited.inventory as unknown[]).push({ name: 'Lantern', quantity: 1 });
    const latest = copy(opened);
    (latest.inventory as unknown[]).splice(0, 1);

    const result = reapplyEdits(opened, edited, latest);

    expect(result.conflicts).toEqual([{ path: ['inventory'], mine: edited.inventory, theirs: latest.inventory }]);
    expect((result.merged as { inventory: unknown[] }).inventory).toEqual(latest.inventory);
  });

  it('reapplies a removed field as removed', () => {
    const edited = copy(opened);
    delete edited.features;
    const latest = { ...copy(opened), backstory: 'Changed elsewhere' };

    const result = reapplyEdits(opened, edited, latest);

    expect(result.merged).not.toHaveProperty('features');
    expect(result.merged).toHaveProperty('backstory', 'Changed elsewhere');
    expect(result.applied).toEqual([{ path: ['features'], mine: undefined }]);
  });

  it('lists nothing the newest version already has', () => {
    const edited = { ...copy(opened), backstory: 'Raised by wolves' };
    const latest = { ...copy(opened), backstory: 'Raised by wolves' };

    const result = reapplyEdits(opened, edited, latest);

    expect(result.applied).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.merged).toEqual(latest);
  });

  it('nests: a list inside a list entry follows the same rules', () => {
    const sheet = { sections: [{ id: 'a', title: 'Notes', items: [{ id: 'i1', text: 'one' }, { id: 'i2', text: 'two' }] }] };
    const edited = copy(sheet);
    edited.sections[0].items[1].text = 'two, edited';
    const latest = copy(sheet);
    latest.sections[0].title = 'Journal';

    const result = reapplyEdits(sheet, edited, latest);

    expect(result.merged).toEqual({
      sections: [{ id: 'a', title: 'Journal', items: [{ id: 'i1', text: 'one' }, { id: 'i2', text: 'two, edited' }] }],
    });
    expect(result.applied).toEqual([{ path: ['sections', 0, 'items', 1, 'text'], mine: 'two, edited' }]);
  });
});

describe('describePath', () => {
  it('names fields in words, and list entries by their own name where they have one', () => {
    expect(describePath(['hp', 'current'], opened)).toBe('HP › Current');
    expect(describePath(['inventory', 1, 'quantity'], opened)).toBe('Inventory › Torch › Quantity');
    expect(describePath(['hitDice', 0, 'remaining'], { hitDice: [{ remaining: 1 }] })).toBe('Hit dice › Entry 1 › Remaining');
    expect(describePath(['characteristics', 'STR', 'regular'], {})).toBe('Characteristics › STR › Regular');
  });
});

describe('describeValue', () => {
  it('shows short values as they are and summarises the rest', () => {
    expect(describeValue('Raised by wolves')).toBe('Raised by wolves');
    expect(describeValue('')).toBe('(empty)');
    expect(describeValue(undefined)).toBe('(removed)');
    expect(describeValue(7)).toBe('7');
    expect(describeValue(true)).toBe('Yes');
    expect(describeValue(['Fire Bolt', 'Light'])).toBe('Fire Bolt, Light');
    expect(describeValue([{ name: 'Rope' }, { name: 'Lantern' }])).toBe('Rope, Lantern');
    expect(describeValue([])).toBe('(empty list)');
    expect(describeValue('x'.repeat(200))).toHaveLength(121);
  });
});
