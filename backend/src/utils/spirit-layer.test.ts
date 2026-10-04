/**
 * Spirit Layer — filterTokensByLighting Unit Tests
 *
 * Tests server-side visibility enforcement for dynamic lighting.
 * The function should only pass tokens that are within the player's
 * raycasting visibility polygon (or tokens controlled by the player themselves).
 */

import { filterTokensByLighting, filterMapData, filterTokensByRole } from './spirit-layer';
import type { WallSegment } from '../types/walls';

// Minimal token factory
function makeToken(
  id: string,
  x: number,
  y: number,
  controlledBy: string | null = null,
  sightRadius = 0
) {
  return {
    id,
    name: `Token ${id}`,
    imageUrl: '',
    position: { x, y },
    size: { width: 1, height: 1 },
    layer: 'token' as const,
    visible: true,
    controlledBy,
    rotation: 0,
    conditions: [],
    metadata: {},
    sightRadius,
  };
}

function makeWall(id: string, x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id, x1, y1, x2, y2, type: 'wall' };
}

// Map is 1000×1000 pixels, gridSize=100 so 10×10 squares
const MAP_WIDTH = 10;
const MAP_HEIGHT = 10;
const GRID_SIZE = 100;
const NO_WALLS: WallSegment[] = [];

describe('filterTokensByLighting', () => {
  it('returns all tokens when lightingEnabled is false', () => {
    const tokens = [makeToken('a', 2, 2), makeToken('b', 7, 7)];
    const result = filterTokensByLighting(tokens, 'user1', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, false);
    expect(result).toHaveLength(2);
  });

  it('sends nothing when the player has no controlled token on the map, whatever the lights', () => {
    // Nobody on the map to look through, so nothing is seen: a light is not a
    // viewer, and a token-less player learning positions was a leak.
    const tokens = [makeToken('a', 2, 2), { ...makeToken('b', 5, 5), visible: false }];
    const lights = [{ id: 'l', x: 250, y: 750, brightRadius: 3, dimRadius: 6, enabled: true }];
    expect(filterTokensByLighting(tokens, 'user-nobody', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true, lights)).toEqual([]);
    expect(filterTokensByLighting(tokens, 'user-nobody', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true, undefined, true)).toEqual([]);
  });

  it('always includes the player\'s own token regardless of sight', () => {
    // Player token at 2,2 with very small sightRadius so it can't see far
    const playerToken = makeToken('mine', 2, 2, 'user1', 0.1);
    // Another token far away
    const farToken = makeToken('far', 8, 8);
    const tokens = [playerToken, farToken];

    const result = filterTokensByLighting(tokens, 'user1', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true);
    // Own token always included
    expect(result.some((t) => t.id === 'mine')).toBe(true);
  });

  it('includes nearby token visible through open space under global illumination', () => {
    const playerToken = makeToken('player', 4, 4, 'user1', 0);
    // Another token one square away — should be in polygon
    const nearbyToken = makeToken('nearby', 5, 4);
    const tokens = [playerToken, nearbyToken];

    const result = filterTokensByLighting(tokens, 'user1', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true, undefined, true);
    expect(result.some((t) => t.id === 'nearby')).toBe(true);
  });

  it('with global illumination off, the same nearby token in the dark is not sent', () => {
    const playerToken = makeToken('player', 4, 4, 'user1', 0);
    const nearbyToken = makeToken('nearby', 5, 4);

    const result = filterTokensByLighting([playerToken, nearbyToken], 'user1', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true);
    expect(result.some((t) => t.id === 'nearby')).toBe(false);
  });

  it('excludes token blocked behind a solid wall', () => {
    // Wall along x=500px (col 5), from y=0 to y=1000, dividing map in half
    const wall = makeWall('wall1', 500, 0, 500, 1000);

    // Player at grid (2,5) = pixel center ~(250,550)
    const playerToken = makeToken('player', 2, 5, 'user1', 0);
    // Token on the far side of the wall at grid (7,5) = pixel center ~(750,550)
    const blockedToken = makeToken('blocked', 7, 5);

    const result = filterTokensByLighting(
      [playerToken, blockedToken],
      'user1',
      [wall],
      MAP_WIDTH,
      MAP_HEIGHT,
      GRID_SIZE,
      true,
      undefined,
      true // global illumination: the wall alone must do the hiding
    );

    expect(result.some((t) => t.id === 'blocked')).toBe(false);
    // Player's own token still included
    expect(result.some((t) => t.id === 'player')).toBe(true);
  });

  it('includes token visible through an open door', () => {
    // Door segment (open) along x=500, does NOT block vision
    const openDoor: WallSegment = { id: 'door1', x1: 500, y1: 0, x2: 500, y2: 1000, type: 'door-open' };

    const playerToken = makeToken('player', 2, 5, 'user1', 0);
    const otherToken = makeToken('other', 7, 5);

    const result = filterTokensByLighting(
      [playerToken, otherToken],
      'user1',
      [openDoor],
      MAP_WIDTH,
      MAP_HEIGHT,
      GRID_SIZE,
      true,
      undefined,
      true
    );

    // Open door doesn't block — token should be visible
    expect(result.some((t) => t.id === 'other')).toBe(true);
  });

  /**
   * A light is not a second pair of eyes.
   *
   * Every light's visibility polygon used to be pushed onto the player's own
   * and the token test was "inside ANY of them", so a creature standing in a
   * lit room was sent to every player on the map — through walls, from any
   * distance. That is a leak rather than a drawing mistake: the position was in
   * the payload, whatever the client chose to paint.
   *
   * Every virtual tabletop that does dynamic lighting treats this the same way:
   * you see a thing when you have line of sight to it AND it is lit. Light
   * reveals what you could already have seen; it never sees on your behalf.
   */
  describe('a light does not grant sight through walls', () => {
    /** Four walls around grid squares 5..8, with one gap when `doorGap` is set. */
    const sealedRoom = (doorGap = false): WallSegment[] => [
      makeWall('n', 500, 500, 900, 500),
      makeWall('e', 900, 500, 900, 900),
      makeWall('s', 500, 900, 900, 900),
      ...(doorGap ? [] : [makeWall('w', 500, 500, 500, 900)]),
    ];

    // Light in the middle of that room, reaching the whole of it.
    const roomLight = [{ id: 'l1', x: 700, y: 700, brightRadius: 3, dimRadius: 5, enabled: true }];

    it('does not send a creature in a lit sealed room to a player outside it', () => {
      const player = makeToken('player', 1, 5, 'user1', 0);
      const inRoom = makeToken('inRoom', 6, 3); // inside the walls, fully lit

      const result = filterTokensByLighting(
        [player, inRoom], 'user1', sealedRoom(), MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true, roomLight
      );

      expect(result.some((t) => t.id === 'inRoom')).toBe(false);
      expect(result.some((t) => t.id === 'player')).toBe(true);
    });

    it('sends it once the player is inside the room with it', () => {
      // Token grid Y is bottom-origin and the walls are in top-origin pixels:
      // grid y=3 maps to pixel y=650, which is inside the 500..900 room.
      const player = makeToken('player', 6, 3, 'user1', 0);
      const inRoom = makeToken('inRoom', 7, 2);

      const result = filterTokensByLighting(
        [player, inRoom], 'user1', sealedRoom(), MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true, roomLight
      );

      expect(result.some((t) => t.id === 'inRoom')).toBe(true);
    });

    it('sends it when the player can see into the room through a gap', () => {
      const player = makeToken('player', 1, 5, 'user1', 0);
      const inRoom = makeToken('inRoom', 6, 3);

      const result = filterTokensByLighting(
        [player, inRoom], 'user1', sealedRoom(true), MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true, roomLight
      );

      expect(result.some((t) => t.id === 'inRoom')).toBe(true);
    });

    it('still sends a creature standing in the open, in the light', () => {
      // Nothing between them: line of sight and lit, so it must come through.
      const player = makeToken('player', 1, 5, 'user1', 0);
      const lit = makeToken('lit', 3, 5);
      const openLight = [{ id: 'l2', x: 300, y: 450, brightRadius: 3, dimRadius: 5, enabled: true }];

      const result = filterTokensByLighting(
        [player, lit], 'user1', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true, openLight
      );

      expect(result.some((t) => t.id === 'lit')).toBe(true);
    });
  });

  /**
   * The lighting filter is reached through filterMapData, and it only runs when
   * that call is told who is asking. One of the three call sites — the REST map
   * fetch, which is what the client makes on opening a map — left the argument
   * off, so a player was handed every token on a lit map while the two
   * WebSocket paths filtered properly. A missing optional argument reads
   * exactly like "no lighting restrictions for this user", which is why it went
   * unnoticed; the parameter is now required.
   */
  describe('filterMapData reaches the lighting filter', () => {
    const litMap = (tokens: ReturnType<typeof makeToken>[]) => ({
      tokens,
      annotations: [],
      lightingEnabled: true,
      fogEnabled: true,
      globalIllumination: false,
      explorationEnabled: true,
      wallSegments: [makeWall('w', 500, 0, 500, 1000)],
      lights: [{ id: 'l1', x: 750, y: 550, brightRadius: 3, dimRadius: 6, enabled: true }],
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      gridSize: GRID_SIZE,
    });

    it('hides a lit token behind a wall from a player', () => {
      const player = makeToken('player', 2, 5, 'user1', 0);
      const behindWall = makeToken('behind', 7, 5);

      const out = filterMapData(
        litMap([player, behindWall]) as never, 'PLAYER', false, 'user1'
      );

      expect(out.tokens.some((t: { id: string }) => t.id === 'behind')).toBe(false);
    });

    it('still shows everything to the DM', () => {
      const player = makeToken('player', 2, 5, 'user1', 0);
      const behindWall = makeToken('behind', 7, 5);

      const out = filterMapData(litMap([player, behindWall]) as never, 'DM', true, 'dm-user');

      expect(out.tokens.some((t: { id: string }) => t.id === 'behind')).toBe(true);
    });

    it('sends a spectator nothing on a lit map, even one a token still names', () => {
      const held = makeToken('held', 2, 5, 'user1', 12);
      const near = makeToken('near', 3, 5);

      const out = filterMapData(litMap([held, near]) as never, 'SPECTATOR', false, 'user1');

      expect(out.tokens).toEqual([]);
    });

    it('passes the fog flag through to every role, so a client knows whether to draw fog', () => {
      const map = { ...litMap([]), fogEnabled: false };
      expect(filterMapData(map as never, 'PLAYER', false, 'user1').fogEnabled).toBe(false);
      expect(filterMapData(map as never, 'DM', true, 'dm-user').fogEnabled).toBe(false);
    });
  });

  /**
   * What a viewer makes out in the dark. The rule the DM guide has always
   * stated: the sight radius governs how far you make things out unlit; it
   * does not limit how far you notice something that is lit.
   */
  describe('sight radius, light and global illumination', () => {
    // A 20×20 map, so a token can stand further than 12 squares away.
    const W = 20;
    const H = 20;

    it('sees within its sight radius and not beyond it', () => {
      const viewer = makeToken('viewer', 0, 5, 'user1', 12);
      const near = makeToken('near', 10, 5); // 10 squares off
      const far = makeToken('far', 14, 5);   // 14 squares off
      const out = filterTokensByLighting([viewer, near, far], 'user1', NO_WALLS, W, H, GRID_SIZE, true);
      expect(out.map((t) => t.id)).toEqual(['viewer', 'near']);
    });

    it('a radius of 0 means none: nothing unlit is sent', () => {
      const viewer = makeToken('viewer', 2, 2, 'user1', 0);
      const next = makeToken('next', 3, 2);
      const out = filterTokensByLighting([viewer, next], 'user1', NO_WALLS, MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, true);
      expect(out.map((t) => t.id)).toEqual(['viewer']);
    });

    it('a lit token is seen beyond the sight radius', () => {
      const viewer = makeToken('viewer', 0, 5, 'user1', 2);
      const lit = makeToken('lit', 8, 5); // centre px (850, 1450) on a 20-high map
      const light = [{ id: 'l', x: 850, y: 1450, brightRadius: 2, dimRadius: 3, enabled: true }];
      const out = filterTokensByLighting([viewer, lit], 'user1', NO_WALLS, W, H, GRID_SIZE, true, light);
      expect(out.map((t) => t.id)).toEqual(['viewer', 'lit']);
    });

    it('a token straight out from a light, inside its dim reach, is lit', () => {
      // A light's reach polygon used to be a fan through wall endpoints and map
      // corners only, so in the open it was a quadrilateral inscribed in the
      // dim circle: a token 7.5 squares straight east of a dim-8 light fell
      // outside it on the server while the client drew it lit.
      const viewer = makeToken('viewer', 2, 14, 'user1', 0);
      const lit = makeToken('lit', 12, 14);
      const light = [{ id: 'l', x: 500, y: 500, brightRadius: 4, dimRadius: 8, enabled: true }];
      const out = filterTokensByLighting([viewer, lit], 'user1', NO_WALLS, W, H, GRID_SIZE, true, light);
      expect(out.map((t) => t.id)).toEqual(['viewer', 'lit']);
    });

    it('with global illumination on, everything in line of sight is sent', () => {
      const viewer = makeToken('viewer', 0, 5, 'user1', 0);
      const far = makeToken('far', 19, 5);
      const out = filterTokensByLighting([viewer, far], 'user1', NO_WALLS, W, H, GRID_SIZE, true, undefined, true);
      expect(out.map((t) => t.id)).toEqual(['viewer', 'far']);
    });
  });

  it('multiple controlled tokens combine sight areas', () => {
    // Two player tokens at opposite ends of map, each seeing their half
    const leftToken = makeToken('left', 1, 5, 'user1', 0);
    const rightToken = makeToken('right', 8, 5, 'user1', 0);

    // Wall dividing map — but since both tokens have unlimited sight, both sides covered
    const wall = makeWall('wall1', 500, 0, 500, 1000);

    const leftNPC = makeToken('leftNPC', 2, 5);
    const rightNPC = makeToken('rightNPC', 7, 5);

    const result = filterTokensByLighting(
      [leftToken, rightToken, leftNPC, rightNPC],
      'user1',
      [wall],
      MAP_WIDTH,
      MAP_HEIGHT,
      GRID_SIZE,
      true,
      undefined,
      true
    );

    // Both NPCs visible because combined sight covers the whole map
    expect(result.some((t) => t.id === 'leftNPC')).toBe(true);
    expect(result.some((t) => t.id === 'rightNPC')).toBe(true);
  });
});

describe('filterTokensByRole', () => {
  // What the server sends a player of each token, field by field. The role
  // filter decides which tokens they get; these decide what of each one.
  const hp = { current: 7, max: 7, temp: 0 };
  const npc = { ...makeToken('npc', 3, 3, null, 12), hp, showHpBar: false, notes: 'secret ambusher', statBlock: { ac: 13 } };
  const shown = { ...makeToken('shown', 4, 4, null, 6), hp, showHpBar: true };
  const mine = { ...makeToken('mine', 5, 5, 'user1', 6), hp, showHpBar: false, notes: 'the DM wrote this' };
  const tokens = [npc, shown, mine];
  const byId = (list: { id: string }[], id: string) => list.find((t) => t.id === id) as Record<string, unknown> | undefined;

  it('sends a player neither notes nor a stat block, on any token', () => {
    const sent = filterTokensByRole(tokens, 'PLAYER', false, 'user1');
    expect(byId(sent, 'npc')).not.toHaveProperty('notes');
    expect(byId(sent, 'npc')).not.toHaveProperty('statBlock');
    expect(byId(sent, 'mine')).not.toHaveProperty('notes');
  });

  it('sends a player hit points only when the bar is shown or the token is theirs', () => {
    const sent = filterTokensByRole(tokens, 'PLAYER', false, 'user1');
    expect(byId(sent, 'npc')?.hp).toBeUndefined();
    expect(byId(sent, 'shown')?.hp).toEqual(hp);
    expect(byId(sent, 'mine')?.hp).toEqual(hp);
  });

  it('sends a player darkvision only for the tokens they control', () => {
    const sent = filterTokensByRole(tokens, 'PLAYER', false, 'user1');
    expect(byId(sent, 'npc')?.sightRadius).toBeUndefined();
    expect(byId(sent, 'shown')?.sightRadius).toBeUndefined();
    expect(byId(sent, 'mine')?.sightRadius).toBe(6);
  });

  it('treats a recipient it was not told about as controlling nothing', () => {
    const sent = filterTokensByRole(tokens, 'PLAYER', false);
    expect(byId(sent, 'mine')?.hp).toBeUndefined();
    expect(byId(sent, 'mine')?.sightRadius).toBeUndefined();
    expect(byId(sent, 'shown')?.hp).toEqual(hp);
  });

  // A spectator still named on a token from their time as a player is sent
  // it as any other player would be: `controlledBy` grants a spectator
  // nothing, on the server as in the move handlers.
  it('treats a spectator as controlling nothing, whatever controlledBy says', () => {
    const veiled = { ...makeToken('veiled', 6, 6, 'user1', 12), hp, showHpBar: false, obscured: true, conditions: ['invisible'] };
    const sent = filterTokensByRole([...tokens, veiled], 'SPECTATOR', false, 'user1');
    expect(byId(sent, 'mine')?.hp).toBeUndefined();
    expect(byId(sent, 'mine')?.sightRadius).toBeUndefined();
    expect(byId(sent, 'shown')?.hp).toEqual(hp);
    expect(byId(sent, 'veiled')?.name).toBe('');
    expect(byId(sent, 'veiled')?.conditions).toEqual([]);
  });

  // "Own" is the recipient's controller id and nobody else's: another
  // player's token is sent without its hit points or darkvision, and masked
  // when obscured, exactly like the DM's.
  it("sends another player's token as any other token: no hit points, no darkvision, masked when obscured", () => {
    const theirs = { ...makeToken('theirs', 6, 6, 'user2', 9), hp, showHpBar: false };
    const theirsVeiled = { ...makeToken('theirs-veiled', 7, 7, 'user2', 9), hp, showHpBar: false, obscured: true, conditions: ['prone'] };
    const sent = filterTokensByRole([theirs, theirsVeiled], 'PLAYER', false, 'user1');
    expect(byId(sent, 'theirs')?.hp).toBeUndefined();
    expect(byId(sent, 'theirs')?.sightRadius).toBeUndefined();
    expect(byId(sent, 'theirs')?.name).toBe('Token theirs');
    expect(byId(sent, 'theirs-veiled')?.name).toBe('');
    expect(byId(sent, 'theirs-veiled')?.conditions).toEqual([]);
    expect(byId(sent, 'theirs-veiled')?.hp).toBeNull();
  });

  // Tokens placed by older versions carry no showHpBar at all; a missing flag
  // is off, or an imported or legacy token with hit points would leak them.
  it('withholds the hit points of a token that has no showHpBar flag', () => {
    const legacy = { ...makeToken('legacy', 8, 8, null, 0), hp };
    expect(byId(filterTokensByRole([legacy], 'PLAYER', false, 'user1'), 'legacy')?.hp).toBeUndefined();
  });

  it('keeps what a player is sent on the token: position, size, the bar flag', () => {
    const sent = byId(filterTokensByRole(tokens, 'PLAYER', false, 'user1'), 'npc');
    expect(sent?.position).toEqual({ x: 3, y: 3 });
    expect(sent?.size).toEqual({ width: 1, height: 1 });
    expect(sent?.showHpBar).toBe(false);
  });

  it('gives the DM the tokens exactly as stored', () => {
    expect(filterTokensByRole(tokens, 'DM', false, 'dm')).toBe(tokens);
  });

  describe('an obscured token', () => {
    const veiled = { ...makeToken('veiled', 6, 6, null, 0), obscured: true, hp, showHpBar: true, conditions: ['prone'], disposition: 'hostile' as const, characterId: 'c1' };
    const ownVeiled = { ...makeToken('own-veiled', 7, 7, 'user1', 0), obscured: true, hp, showHpBar: false, conditions: ['prone'] };

    it('reaches a player who does not control it as a shape with no identity', () => {
      const sent = byId(filterTokensByRole([veiled], 'PLAYER', false, 'user1'), 'veiled');
      expect(sent?.name).toBe('');
      expect(sent?.imageUrl).toBe('');
      expect(sent?.conditions).toEqual([]);
      expect(sent?.hp).toBeNull();
      expect(sent?.disposition).toBeNull();
      expect(sent?.characterId).toBeNull();
      expect(sent?.position).toEqual({ x: 6, y: 6 });
      expect(sent?.obscured).toBe(true);
    });

    it('never names the creature template a placed token came from to a player who does not control it', () => {
      const fromLibrary = { ...makeToken('placed', 9, 9, null, 0), creatureTemplateId: 'tmpl-1' };
      const sent = byId(filterTokensByRole([fromLibrary], 'PLAYER', false, 'user1'), 'placed');
      expect(sent).not.toHaveProperty('creatureTemplateId');
    });

    it('tells another player neither who controls it nor what kind of token it is', () => {
      const disguised = { ...makeToken('disguised', 8, 8, 'user2', 0), obscured: true, type: 'player' as const, rotation: 90, initiative: 17, displayMode: 'full-art' as const };
      const sent = byId(filterTokensByRole([disguised], 'PLAYER', false, 'user1'), 'disguised');
      expect(sent?.controlledBy).toBeNull();
      expect(sent?.type).toBe('npc');
      expect(sent?.rotation).toBe(0);
      expect(sent?.initiative).toBeNull();
      expect(sent?.displayMode).toBe('pog');
    });

    it('reaches its controller whole', () => {
      const sent = byId(filterTokensByRole([ownVeiled], 'PLAYER', false, 'user1'), 'own-veiled');
      expect(sent?.name).toBe('Token own-veiled');
      expect(sent?.hp).toEqual(hp);
      expect(sent?.conditions).toEqual(['prone']);
    });

    it('reaches the DM as stored', () => {
      expect(filterTokensByRole([veiled], 'DM', false, 'dm')[0]).toBe(veiled);
    });
  });
});
