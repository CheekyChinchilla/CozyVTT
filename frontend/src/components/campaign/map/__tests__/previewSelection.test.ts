import { describe, it, expect } from 'vitest';
import {
  encodePreviewSelection,
  decodePreviewSelection,
  previewOwnFor,
  previewMemoryUser,
  previewOptions,
  defaultPreviewSelection,
  reconcilePreviewSelection,
  tokensShownInPreview,
  previewControlsFor,
  previewTokens,
  previewPlane,
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
const wizard = token({ id: 'wizard', name: 'Wizard', type: TokenType.PLAYER, characterId: 'char-bob', controlledBy: 'bob' });
// Bound to Bob's character but controlled by nobody: not Bob's, as the server sees it.
const orphan = token({ id: 'orphan', name: 'Orphan', type: TokenType.PLAYER, characterId: 'char-bob' });
const goblin = token({ id: 'goblin', name: 'Goblin' });
const ghost = token({ id: 'ghost', name: 'Ghost', layer: TokenLayer.SPIRIT });
const chest = token({ id: 'chest', name: 'Chest', type: TokenType.OBJECT });
const all = [goblin, hero, chest, wizard, ghost, orphan];

// A player never looks through a token the server would not send them.
const hiddenRogue = token({ id: 'rogue', name: 'Rogue', type: TokenType.PLAYER, controlledBy: 'alice', visible: false });
const spiritMonk = token({ id: 'monk', name: 'Monk', type: TokenType.PLAYER, controlledBy: 'alice', layer: TokenLayer.SPIRIT });
const withUnseen = [...all, hiddenRogue, spiritMonk];

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
  it('a player: the tokens they control; a character binding alone is not control', () => {
    const own = previewOwnFor({ kind: 'player', userId: 'bob' }, 'material');
    expect(all.filter(own).map((t) => t.id)).toEqual(['wizard']);
    const alice = previewOwnFor({ kind: 'player', userId: 'alice' }, 'material');
    expect(all.filter(alice).map((t) => t.id)).toEqual(['hero']);
  });

  it('a token: that token only, whoever controls it', () => {
    const own = previewOwnFor({ kind: 'token', tokenId: 'goblin' }, 'material');
    expect(all.filter(own).map((t) => t.id)).toEqual(['goblin']);
  });

  it('the party: every player-type token, controlled or not', () => {
    const own = previewOwnFor({ kind: 'party' }, 'material');
    expect(all.filter(own).map((t) => t.id)).toEqual(['hero', 'wizard', 'orphan']);
  });

  it('nothing selected: nobody', () => {
    expect(all.filter(previewOwnFor(null, 'material'))).toEqual([]);
  });

  it('a hidden token, or one on the other plane, never supplies sight', () => {
    // On the material plane a player is sent neither a hidden token nor a
    // spirit one, and on the spirit plane no material one.
    const alice = { kind: 'player', userId: 'alice' } as const;
    expect(withUnseen.filter(previewOwnFor(alice, 'material')).map((t) => t.id)).toEqual(['hero']);
    expect(withUnseen.filter(previewOwnFor(alice, 'spirit')).map((t) => t.id)).toEqual(['monk']);
    const party = previewOwnFor({ kind: 'party' }, 'material');
    expect(withUnseen.filter(party).map((t) => t.id)).toEqual(['hero', 'wizard', 'orphan']);
    expect(withUnseen.filter(previewOwnFor({ kind: 'token', tokenId: 'rogue' }, 'material'))).toEqual([]);
    expect(withUnseen.filter(previewOwnFor({ kind: 'token', tokenId: 'monk' }, 'material'))).toEqual([]);
    expect(withUnseen.filter(previewOwnFor({ kind: 'token', tokenId: 'monk' }, 'spirit')).map((t) => t.id)).toEqual(['monk']);
  });
});

// Which plane the previewed viewer is on, by the server's rule: the spirit
// plane for everyone while the DM has it open, else for a player who controls
// a visible token on the spirit layer. A preview that stayed on the material
// plane drew a player whose token had crossed over as darkness, with no
// token to see through, while their own screen showed the spirit layer.
describe('previewPlane', () => {
  const alice = { kind: 'player', userId: 'alice' } as const;
  const bob = { kind: 'player', userId: 'bob' } as const;

  it('a player with a visible token on the spirit layer is in the spirit realm', () => {
    expect(previewPlane(alice, withUnseen, false)).toBe('spirit');
    expect(previewPlane(bob, withUnseen, false)).toBe('material');
  });

  it('a hidden spirit token does not take its player across', () => {
    const hiddenMonk = { ...spiritMonk, visible: false };
    expect(previewPlane(alice, [hero, hiddenMonk], false)).toBe('material');
  });

  it('a token preview is on that token\'s plane', () => {
    expect(previewPlane({ kind: 'token', tokenId: 'monk' }, withUnseen, false)).toBe('spirit');
    expect(previewPlane({ kind: 'token', tokenId: 'hero' }, withUnseen, false)).toBe('material');
  });

  it('everyone is on the spirit plane while the DM has it open to all, and the party only then', () => {
    expect(previewPlane(bob, withUnseen, true)).toBe('spirit');
    expect(previewPlane({ kind: 'token', tokenId: 'hero' }, withUnseen, true)).toBe('spirit');
    expect(previewPlane({ kind: 'party' }, withUnseen, true)).toBe('spirit');
    expect(previewPlane({ kind: 'party' }, withUnseen, false)).toBe('material');
    expect(previewPlane(null, withUnseen, false)).toBe('material');
  });
});

describe('tokensShownInPreview', () => {
  const viewport = { gridSize: 50, mapHeight: 20 };
  const own = (t: Token) => t.id === 'hero';

  it('with lighting off: every visible token on the material plane', () => {
    expect(tokensShownInPreview(withUnseen, own, null, viewport, 'material').map((t) => t.id)).toEqual(['goblin', 'hero', 'chest', 'wizard', 'orphan']);
  });

  it('on the spirit plane: every visible spirit token, and nothing from the material plane', () => {
    expect(tokensShownInPreview(withUnseen, own, null, viewport, 'spirit').map((t) => t.id)).toEqual(['ghost', 'monk']);
  });

  it('with lighting on: the viewer\'s own tokens and whatever the rule says they can see', () => {
    // The goblin stands at the origin; everything else is placed out of sight.
    const placed = withUnseen.map((t) => (t.id === 'goblin' ? t : { ...t, position: { x: 9, y: 9 } }));
    const canSee = (cx: number, cy: number) => cx < 100 && cy > 900;
    expect(tokensShownInPreview(placed, own, canSee, viewport, 'material').map((t) => t.id)).toEqual(['goblin', 'hero']);
  });

  it('never a hidden or off-plane token, even one the rule could see', () => {
    expect(tokensShownInPreview(withUnseen, own, () => true, viewport, 'material').map((t) => t.id)).toEqual(['goblin', 'hero', 'chest', 'wizard', 'orphan']);
  });
});

describe('previewMemoryUser', () => {
  const seated = [member('dm', 'DM', 'The DM'), member('alice', 'PLAYER', 'Alice'), member('bob', 'PLAYER', 'Bob'), member('watcher', 'SPECTATOR', 'Watcher')];

  it('a player preview shows that player\'s remembered ground', () => {
    expect(previewMemoryUser({ kind: 'player', userId: 'bob' }, all, seated)).toBe('bob');
  });

  it("a token preview shows the memory of whoever controls it", () => {
    // Previewing one character's view is the in-person table's way of asking
    // "what does this character know", and what they have already explored is
    // part of that. Memory belongs to a person, so it comes from the token's
    // controller.
    expect(previewMemoryUser({ kind: 'token', tokenId: 'hero' }, all, seated)).toBe('alice');
    expect(previewMemoryUser({ kind: 'token', tokenId: 'wizard' }, all, seated)).toBe('bob');
  });

  it('shows none for a token nobody controls, and none for a token that has gone', () => {
    expect(previewMemoryUser({ kind: 'token', tokenId: 'goblin' }, all, seated)).toBeNull();
    expect(previewMemoryUser({ kind: 'token', tokenId: 'orphan' }, all, seated)).toBeNull();
    expect(previewMemoryUser({ kind: 'token', tokenId: 'not-on-this-map' }, all, seated)).toBeNull();
  });

  it('shows none for the party, where several memories would be laid over each other', () => {
    expect(previewMemoryUser({ kind: 'party' }, all, seated)).toBeNull();
    expect(previewMemoryUser(null, all, seated)).toBeNull();
  });

  // Memory is written as the previewed person, and the server takes that
  // only for a member of the campaign. A token still names whoever controlled
  // it after they leave or stop playing; its preview then shows and writes no
  // memory, rather than having every write refused.
  it("shows none for a token whose controller has left the campaign or only watches it", () => {
    const leftBehind = token({ id: 'left', name: 'Left', type: TokenType.PLAYER, controlledBy: 'carol' });
    const watched = token({ id: 'watched', name: 'Watched', type: TokenType.PLAYER, controlledBy: 'watcher' });
    expect(previewMemoryUser({ kind: 'token', tokenId: 'left' }, [leftBehind], seated)).toBeNull();
    expect(previewMemoryUser({ kind: 'token', tokenId: 'watched' }, [watched], seated)).toBeNull();
  });
});


describe('previewOptions', () => {
  const members = [member('dm', 'DM', 'The DM'), member('bob', 'PLAYER', 'Bob'), member('watcher', 'SPECTATOR', 'Watcher')];

  it('lists players, then the party, then player tokens, then the rest, spirit ones named as such', () => {
    expect(previewOptions(members, all).map((o) => [o.group, o.value, o.label])).toEqual([
      ['players', 'player:bob', 'Bob'],
      ['tokens', 'party', 'All player tokens'],
      ['tokens', 'token:hero', 'Hero'],
      ['tokens', 'token:orphan', 'Orphan'],
      ['tokens', 'token:wizard', 'Wizard'],
      ['tokens', 'token:chest', 'Chest'],
      ['tokens', 'token:ghost', 'Ghost (spirit)'],
      ['tokens', 'token:goblin', 'Goblin'],
    ]);
  });

  it('offers no party entry without a player-type token', () => {
    expect(previewOptions([], [goblin]).map((o) => o.value)).toEqual(['token:goblin']);
  });

  it('does not offer a hidden token, and no party entry when every player token is hidden', () => {
    expect(previewOptions([], [goblin, hiddenRogue]).map((o) => o.value)).toEqual(['token:goblin']);
    expect(previewOptions([], withUnseen).map((o) => o.value)).not.toContain('token:rogue');
  });
});

describe('reconcilePreviewSelection', () => {
  it('keeps a selection the picker still offers', () => {
    const sel: PreviewSelection = { kind: 'token', tokenId: 'goblin' };
    expect(reconcilePreviewSelection(sel, [], all)).toBe(sel);
  });

  it('falls back when the chosen token is hidden from players', () => {
    const sel: PreviewSelection = { kind: 'token', tokenId: 'rogue' };
    expect(reconcilePreviewSelection(sel, [], withUnseen)).toEqual({ kind: 'party' });
  });

  it('falls back when the token is gone from the map', () => {
    const sel: PreviewSelection = { kind: 'token', tokenId: 'goblin' };
    expect(reconcilePreviewSelection(sel, [member('bob', 'PLAYER', 'Bob')], [hero])).toEqual({ kind: 'player', userId: 'bob' });
    expect(reconcilePreviewSelection(sel, [], [])).toBeNull();
    expect(reconcilePreviewSelection(null, [], all)).toBeNull();
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

describe('previewControlsFor', () => {
  const alicesOwn = token({ id: 'a', name: 'Alice', controlledBy: 'alice', type: TokenType.PLAYER });
  const bobsOwn = token({ id: 'b', name: 'Bob', controlledBy: 'bob', type: TokenType.PLAYER });

  it('a player controls the tokens they control', () => {
    const controls = previewControlsFor({ kind: 'player', userId: 'alice' });
    expect(controls(alicesOwn)).toBe(true);
    expect(controls(bobsOwn)).toBe(false);
  });

  it('a token preview is its own controller', () => {
    const controls = previewControlsFor({ kind: 'token', tokenId: 'b' });
    expect(controls(bobsOwn)).toBe(true);
    expect(controls(alicesOwn)).toBe(false);
  });

  it('the party controls nothing: several people share the screen, and no one of them is sent the whole token', () => {
    const controls = previewControlsFor({ kind: 'party' });
    expect(controls(alicesOwn)).toBe(false);
    expect(controls(bobsOwn)).toBe(false);
    expect(previewControlsFor(null)(alicesOwn)).toBe(false);
  });
});

describe('previewTokens', () => {
  const viewport = { gridSize: 50, mapHeight: 10 };
  const nobody = () => false;

  it('shows an obscured token the previewed player does not control as the server sends it', () => {
    const veiled = token({ id: 'v', name: 'Goblin Boss', imageUrl: '/api/assets/tokens/v', obscured: true, conditions: ['prone'], hp: { current: 3, max: 9, temp: 0 } });
    const [seen] = previewTokens([veiled], nobody, nobody, null, viewport, 'material');
    expect(seen.name).toBe('');
    expect(seen.imageUrl).toBe('');
    expect(seen.conditions).toEqual([]);
    expect(seen.hp).toBeNull();
    expect(seen.obscured).toBe(true);
    expect(seen.id).toBe('v');
  });

  it('leaves the previewed player\'s own obscured token whole, and plain tokens untouched', () => {
    const own = token({ id: 'o', name: 'Familiar', obscured: true, controlledBy: 'alice' });
    const plain = token({ id: 'p', name: 'Cultist' });
    const alice = (t: Token) => t.controlledBy === 'alice';
    const seen = previewTokens([own, plain], alice, alice, null, viewport, 'material');
    expect(seen.map((t) => t.name)).toEqual(['Familiar', 'Cultist']);
  });

  it('strips what the viewer is not sent of a token they do not control: hit points with the bar off, darkvision', () => {
    // The hover card and the downed fade read these; a real player has neither.
    const barOff = token({ id: 'b', name: 'Orc', hp: { current: 0, max: 10, temp: 0 }, showHpBar: false, sightRadius: 12 });
    const barOn = token({ id: 'o', name: 'Ogre', hp: { current: 5, max: 9, temp: 0 }, showHpBar: true });
    const seen = previewTokens([barOff, barOn], nobody, nobody, null, viewport, 'material');
    expect(seen.find((t) => t.id === 'b')).not.toHaveProperty('hp');
    expect(seen.find((t) => t.id === 'b')).not.toHaveProperty('sightRadius');
    expect(seen.find((t) => t.id === 'o')?.hp).toEqual({ current: 5, max: 9, temp: 0 });
  });

  it('masks every obscured token in the party view, whose sight comes from tokens nobody on the screen controls alone', () => {
    const rogue = token({ id: 'r', name: 'Disguised Rogue', imageUrl: '/api/assets/tokens/r', obscured: true, controlledBy: 'alice', type: TokenType.PLAYER });
    const party = previewOwnFor({ kind: 'party' }, 'material');
    const controls = previewControlsFor({ kind: 'party' });
    const [seen] = previewTokens([rogue], party, controls, null, viewport, 'material');
    expect(seen.name).toBe('');
    expect(seen.imageUrl).toBe('');
    expect(seen.controlledBy).toBeNull();
  });

  it('drops what the preview would not show at all, before masking', () => {
    const hidden = token({ id: 'h', name: 'Ambusher', visible: false, obscured: true });
    expect(previewTokens([hidden], nobody, nobody, null, viewport, 'material')).toEqual([]);
  });
});
