import { describe, it, expect } from 'vitest';
import {
  encodePreviewSelection,
  decodePreviewSelection,
  previewOwnFor,
  previewMemoryUser,
  previewOptions,
  defaultPreviewSelection,
  type PreviewSelection,
} from '../previewSelection';
import type { CampaignMembership, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const token = (over: Partial<Token> & { id: string; name: string }): Token => ({
  characterId: null,
  imageUrl: '',
  position: { x: 0, y: 0 },
  size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN,
  visible: true,
  controlledBy: null,
  rotation: 0,
  conditions: [],
  metadata: {},
  type: TokenType.NPC,
  ...over,
} as Token);

const member = (userId: string, role: string, displayName: string): Pick<CampaignMembership, 'userId' | 'role' | 'user'> =>
  ({ userId, role, user: { displayName } } as unknown as Pick<CampaignMembership, 'userId' | 'role' | 'user'>);

const hero = token({ id: 'hero', name: 'Hero', type: TokenType.PLAYER, controlledBy: 'alice' });
const wizard = token({ id: 'wizard', name: 'Wizard', type: TokenType.PLAYER, characterId: 'char-bob' });
const goblin = token({ id: 'goblin', name: 'Goblin' });
const ghost = token({ id: 'ghost', name: 'Ghost', layer: TokenLayer.SPIRIT });
const chest = token({ id: 'chest', name: 'Chest', type: TokenType.OBJECT });
const all = [goblin, hero, chest, wizard, ghost];
const characters = [{ id: 'char-bob', userId: 'bob' }];

describe('encoding', () => {
  it.each<PreviewSelection>([
    { kind: 'player', userId: 'alice' },
    { kind: 'token', tokenId: 'hero' },
    { kind: 'party' },
  ])('round-trips %j', (selection) => {
    expect(decodePreviewSelection(encodePreviewSelection(selection))).toEqual(selection);
  });

  it('refuses anything else', () => {
    expect(decodePreviewSelection('')).toBeNull();
    expect(decodePreviewSelection('player:')).toBeNull();
    expect(decodePreviewSelection('goblin:hero')).toBeNull();
  });
});

describe('previewOwnFor', () => {
  it('a player: the tokens they control or that are bound to their character', () => {
    const own = previewOwnFor({ kind: 'player', userId: 'bob' }, characters);
    expect(all.filter(own).map((t) => t.id)).toEqual(['wizard']);
    const alice = previewOwnFor({ kind: 'player', userId: 'alice' }, characters);
    expect(all.filter(alice).map((t) => t.id)).toEqual(['hero']);
  });

  it('a token: that token only, whoever controls it', () => {
    const own = previewOwnFor({ kind: 'token', tokenId: 'goblin' }, characters);
    expect(all.filter(own).map((t) => t.id)).toEqual(['goblin']);
  });

  it('the party: every player-type token', () => {
    const own = previewOwnFor({ kind: 'party' }, characters);
    expect(all.filter(own).map((t) => t.id)).toEqual(['hero', 'wizard']);
  });

  it('nothing selected: nobody', () => {
    expect(all.filter(previewOwnFor(null, characters))).toEqual([]);
  });
});

describe('previewMemoryUser', () => {
  it('only a player preview has remembered ground', () => {
    expect(previewMemoryUser({ kind: 'player', userId: 'bob' })).toBe('bob');
    expect(previewMemoryUser({ kind: 'token', tokenId: 'hero' })).toBeNull();
    expect(previewMemoryUser({ kind: 'party' })).toBeNull();
    expect(previewMemoryUser(null)).toBeNull();
  });
});

describe('previewOptions', () => {
  const members = [member('dm', 'DM', 'The DM'), member('bob', 'PLAYER', 'Bob'), member('watcher', 'SPECTATOR', 'Watcher')];

  it('lists players, then the party, then player tokens, then the rest, off the material plane', () => {
    expect(previewOptions(members, all).map((o) => [o.group, o.value, o.label])).toEqual([
      ['players', 'player:bob', 'Bob'],
      ['tokens', 'party', 'All player tokens'],
      ['tokens', 'token:hero', 'Hero'],
      ['tokens', 'token:wizard', 'Wizard'],
      ['tokens', 'token:chest', 'Chest'],
      ['tokens', 'token:goblin', 'Goblin'],
    ]);
  });

  it('offers no party entry without a player-type token', () => {
    expect(previewOptions([], [goblin]).map((o) => o.value)).toEqual(['token:goblin']);
  });
});

describe('defaultPreviewSelection', () => {
  it('starts on the first player when there is one', () => {
    expect(defaultPreviewSelection([member('bob', 'PLAYER', 'Bob')], all)).toEqual({ kind: 'player', userId: 'bob' });
  });

  it('starts on the party for a table with no player accounts', () => {
    expect(defaultPreviewSelection([member('dm', 'DM', 'The DM')], all)).toEqual({ kind: 'party' });
  });

  it('falls back to the first token, then to nothing', () => {
    expect(defaultPreviewSelection([], [goblin])).toEqual({ kind: 'token', tokenId: 'goblin' });
    expect(defaultPreviewSelection([], [])).toBeNull();
  });
});
