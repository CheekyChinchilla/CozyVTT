import { describe, it, expect } from 'vitest';
import { tokenCopyRequest, clampTokenPosition } from '../tokenCopy';
import type { Token } from '@/types';
import { TokenLayer, TokenType, TokenDisposition } from '@/types';

/**
 * The bug this pins: moving a token to another map rebuilt it from a
 * hand-written list of fields. The list left out `type`, so the server's
 * default made a player's token an NPC, and left out nine more besides,
 * among them darkvision and an NPC's stat block. Three move sites and two
 * duplicate sites each had their own list, and each had forgotten something
 * different.
 */
const full: Token = {
  id: 'tok-1',
  characterId: 'char-1',
  name: 'Aldra',
  imageUrl: '/api/assets/tokens/asset-9',
  position: { x: 4, y: 5 },
  size: { width: 2, height: 3 },
  layer: TokenLayer.TOKEN,
  visible: false,
  controlledBy: 'user-7',
  rotation: 90,
  conditions: ['prone'],
  metadata: { mount: 'pony' },
  type: TokenType.PLAYER,
  disposition: TokenDisposition.FRIENDLY,
  hp: { current: 3, max: 12, temp: 2 },
  showHpBar: true,
  notes: 'knows the password',
  initiative: 17,
  sightRadius: 12,
  displayMode: 'full-art',
  statBlock: { ac: 15, speed: '30 ft.', abilities: { str: 10, dex: 14, con: 12, int: 8, wis: 11, cha: 9 } },
  creatureTemplateId: 'creature-3',
};

describe('tokenCopyRequest', () => {
  it('carries every field the token has, except where it was', () => {
    const request = tokenCopyRequest(full, { x: 0, y: 0 });
    for (const key of Object.keys(full) as (keyof Token)[]) {
      if (key === 'id' || key === 'position') continue;
      const expected = key === 'imageUrl' ? 'asset-9' : full[key];
      expect({ key, value: (request as unknown as Record<string, unknown>)[key] }).toEqual({ key, value: expected });
    }
  });

  it('puts the token at the position it is given', () => {
    expect(tokenCopyRequest(full, { x: 11, y: 2 }).position).toEqual({ x: 11, y: 2 });
  });

  it('sends the asset id, not a serving path the server would have to unpick', () => {
    expect(tokenCopyRequest(full, { x: 0, y: 0 }).imageUrl).toBe('asset-9');
    expect(tokenCopyRequest({ ...full, imageUrl: 'asset-9' }, { x: 0, y: 0 }).imageUrl).toBe('asset-9');
    expect(tokenCopyRequest({ ...full, imageUrl: '' }, { x: 0, y: 0 }).imageUrl).toBe('');
  });

  it('never carries the id, so the copy is its own token', () => {
    expect((tokenCopyRequest(full, { x: 0, y: 0 }) as unknown as Record<string, unknown>).id).toBeUndefined();
  });
});

describe('clampTokenPosition', () => {
  const map = { width: 10, height: 8 };

  it('keeps the whole footprint on the map, not just its corner', () => {
    // A 2x3 token on a 10x8 map can start at x=8 and y=5 at the furthest.
    expect(clampTokenPosition({ x: 20, y: 20 }, { width: 2, height: 3 }, map)).toEqual({ x: 8, y: 5 });
  });

  it('leaves a position that already fits alone', () => {
    expect(clampTokenPosition({ x: 3, y: 4 }, { width: 1, height: 1 }, map)).toEqual({ x: 3, y: 4 });
  });

  it('never goes negative, however small the map', () => {
    expect(clampTokenPosition({ x: 5, y: 5 }, { width: 4, height: 4 }, { width: 2, height: 2 })).toEqual({ x: 0, y: 0 });
  });
});
