/**
 * Reading `/w <name> <message>`, past what the chat panel's tests reach: a
 * `/w` with nothing after it, a name ended by a new line, a name with no
 * member, text that only looks like the command, `/whisper`, its long form,
 * and a name that is another member's with a word added. And the names the
 * chat shows for members, which never let two look the same.
 */

import { describe, it, expect } from 'vitest';
import { CampaignRole } from '@/types';
import type { CampaignMembership, Character } from '@/types';
import { readSlashWhisper, slashWhisperRefusal, whisperTargets, joinedDay } from '../chatWhisper';
import type { WhisperTarget } from '../chatWhisper';

const target = (userId: string, displayName: string): WhisperTarget => ({ userId, displayName, label: displayName });
const TABLE = [target('mara', 'Mara'), target('maralee', 'Mara Lee'), target('cole', 'Cole')];

it('is not a whisper unless the text starts with /w and a space or ends there', () => {
  expect(readSlashWhisper('/wave hello', TABLE)).toEqual({ kind: 'none' });
  expect(readSlashWhisper('hello /w Mara hi', TABLE)).toEqual({ kind: 'none' });
});

it('asks for a name after a bare /w or /whisper', () => {
  for (const text of ['/w', '/whisper ']) {
    const read = readSlashWhisper(text, TABLE);
    expect(read).toEqual({ kind: 'nobody', typed: '' });
    if (read.kind !== 'none') expect(slashWhisperRefusal(read)).toBe('Write a name after /w or /whisper, then your message.');
  }
});

it('reads /whisper as the long form of /w', () => {
  const noMara = TABLE.filter((t) => t.userId !== 'mara');
  expect(readSlashWhisper('/whisper Mara Lee Over here', noMara)).toEqual({ kind: 'to', userId: 'maralee', content: 'Over here' });
  expect(readSlashWhisper('/WHISPER cole psst', TABLE)).toEqual({ kind: 'to', userId: 'cole', content: 'psst' });
});

it('does not let a member named after another plus a word catch a /w for the other', () => {
  const table = [target('dana', 'Dana'), target('trap', 'Dana I')];
  expect(readSlashWhisper('/w Dana I think Vex is the traitor', table)).toEqual({ kind: 'several', labels: ['Dana', 'Dana I'] });
});

it('does not let a member named after the first word of another\'s name catch a /w for the other', () => {
  const table = [target('dana', 'Dana Smith'), target('trap', 'Dana')];
  expect(readSlashWhisper('/w Dana are you there', table)).toEqual({ kind: 'several', labels: ['Dana Smith', 'Dana'] });
});

it('reads a whole name that only begins another name, with no space between', () => {
  const table = [target('mara', 'Mara'), target('marat', 'Marat')];
  expect(readSlashWhisper('/w Mara hi', table)).toEqual({ kind: 'to', userId: 'mara', content: 'hi' });
});

it('reads a name ended by a new line', () => {
  expect(readSlashWhisper('/w Cole\nTwo lines\nof it', TABLE)).toEqual({ kind: 'to', userId: 'cole', content: 'Two lines\nof it' });
});

it('does not take a name that only begins a longer word', () => {
  expect(readSlashWhisper('/w Marathon runs', TABLE)).toEqual({ kind: 'nobody', typed: 'Marathon' });
});

it('reads a name with a letter whose lower case is longer, such as İ', () => {
  expect(readSlashWhisper('/w İlker hi', [target('ilker', 'İlker')])).toEqual({ kind: 'to', userId: 'ilker', content: 'hi' });
});

it('does not let a name written with i and a combining dot catch a /w for a name with İ', () => {
  const table = [target('ilker', 'İlker'), target('trap', 'i̇lke')];
  expect(readSlashWhisper('/w İlker hi', table)).toEqual({ kind: 'to', userId: 'ilker', content: 'hi' });
});

describe('the names the chat shows for members', () => {
  const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`;
  const member = (userId: string, displayName: string, role: CampaignRole, joined: string, characterIds: string[] = []): CampaignMembership => ({
    id: `m-${userId}`, userId, campaignId: 'c1', role, characterIds, joinedAt: joined, user: { id: userId, displayName, avatarUrl: null },
  });
  const character = (id: string, userId: string, name: string) => ({ id, userId, name }) as Character;
  const labels = (members: CampaignMembership[], characters: Character[] = []) =>
    Object.fromEntries([...whisperTargets(members, characters).values()].map((t) => [t.userId, t.label]));
  const day = (d: number) => joinedDay(at(d));

  it('leaves a name nobody else has as it is', () => {
    expect(labels([member('dm', 'Dana', CampaignRole.DM, at(1)), member('ash', 'Ash', CampaignRole.PLAYER, at(2))])).toEqual({ dm: 'Dana', ash: 'Ash' });
  });

  it('puts the role first beside a shared name, then a player\'s character', () => {
    expect(labels(
      [member('dm', 'Mara', CampaignRole.DM, at(1)), member('p1', ' mara', CampaignRole.PLAYER, at(2), ['vex']), member('s1', 'MARA', CampaignRole.SPECTATOR, at(3))],
      [character('vex', 'p1', 'Vex')]
    )).toEqual({ dm: 'Mara (DM)', p1: ' mara (Player, Vex)', s1: 'MARA (Spectator)' });
  });

  it('tells two characterless players of one name apart by the day each joined', () => {
    expect(labels([member('p1', 'Mara', CampaignRole.PLAYER, at(3)), member('p2', 'Mara', CampaignRole.PLAYER, at(9))])).toEqual({
      p1: `Mara (Player, joined ${day(3)})`,
      p2: `Mara (Player, joined ${day(9)})`,
    });
  });

  it('tells two players with one character name apart by the day each joined', () => {
    expect(labels(
      [member('p1', 'Mara', CampaignRole.PLAYER, at(3), ['a']), member('p2', 'Mara', CampaignRole.PLAYER, at(9), ['b'])],
      [character('a', 'p1', 'Vex'), character('b', 'p2', 'Vex')]
    )).toEqual({ p1: `Mara (Player, Vex, joined ${day(3)})`, p2: `Mara (Player, Vex, joined ${day(9)})` });
  });

  it('numbers those who joined on the same day in the order they joined, the earlier keeping 1', () => {
    const later = '2026-10-03T18:00:00.000Z';
    const earlier = '2026-10-03T09:00:00.000Z';
    expect(labels([member('p2', 'Mara', CampaignRole.PLAYER, later), member('p1', 'Mara', CampaignRole.PLAYER, earlier)])).toEqual({
      p1: `Mara (Player, joined ${joinedDay(earlier)}, 1)`,
      p2: `Mara (Player, joined ${joinedDay(later)}, 2)`,
    });
  });

  it('cannot let a character named DM pass a player off as the DM', () => {
    expect(labels(
      [member('dm', 'Dana', CampaignRole.DM, at(1)), member('p1', 'Dana', CampaignRole.PLAYER, at(2), ['x'])],
      [character('x', 'p1', 'DM')]
    )).toEqual({ dm: 'Dana (DM)', p1: 'Dana (Player, DM)' });
  });

  it('never gives two members equal names, however a name is written', () => {
    const members = [
      member('p1', 'Mara', CampaignRole.PLAYER, at(3)),
      member('p2', 'Mara', CampaignRole.PLAYER, at(3)),
      member('p3', `Mara (Player, joined ${day(3)}, 1)`, CampaignRole.PLAYER, at(4)),
      member('p4', 'Mara (Player)', CampaignRole.PLAYER, at(5)),
    ];
    const shown = Object.values(labels(members)).map((l) => l.trim().toLowerCase());
    expect(new Set(shown).size).toBe(shown.length);
  });
});
