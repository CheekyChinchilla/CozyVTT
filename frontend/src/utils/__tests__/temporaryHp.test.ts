/**
 * Who is offered Temporary HP..., and on what: the server's rules, so the
 * menus offer nothing the server refuses.
 *
 * A character's hit points are on its sheet, and its owner while a player
 * and the DM change them (character.hp.temporary). A creature's are its
 * token's, the DM's alone (the token update route). Only in D&D 5e and
 * Pathfinder 2e, whose sheets keep temporary hit points, and only where there
 * are hit points to add them to.
 */

import { describe, it, expect } from 'vitest';
import { CampaignRole, GameSystem, TokenLayer, TokenType, type Token } from '@/types';
import { characterTemporaryHp, tokenTemporaryHp } from '../temporaryHp';

const hp = (temp: number) => ({ current: 10, max: 20, temp });
const character = { id: 'char-1', userId: 'alice', gameSystem: GameSystem.DND_5E };

function token(extra: Partial<Token> = {}): Token {
  return {
    id: 'tok-1', name: 'Wolf', imageUrl: '', characterId: null, position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null,
    metadata: {}, disposition: null, hp: hp(3), showHpBar: false, initiative: null, ...extra,
  };
}

describe('a character', () => {
  it('is offered to its owner while a player, and to the DM, with what it has', () => {
    expect(characterTemporaryHp(character, hp(4), { userId: 'alice', role: CampaignRole.PLAYER }))
      .toEqual({ kind: 'character', characterId: 'char-1', current: 4, system: GameSystem.DND_5E });
    expect(characterTemporaryHp(character, hp(4), { userId: 'dm', role: CampaignRole.DM })).not.toBeNull();
  });

  it('is not offered to another player, or to a spectator, even its owner', () => {
    expect(characterTemporaryHp(character, hp(4), { userId: 'bob', role: CampaignRole.PLAYER })).toBeNull();
    expect(characterTemporaryHp(character, hp(4), { userId: 'alice', role: CampaignRole.SPECTATOR })).toBeNull();
  });

  it('is offered in Pathfinder 2e, and not in Call of Cthulhu or with no system', () => {
    const viewer = { userId: 'alice', role: CampaignRole.PLAYER };
    expect(characterTemporaryHp({ ...character, gameSystem: GameSystem.PATHFINDER_2E }, hp(0), viewer)).not.toBeNull();
    expect(characterTemporaryHp({ ...character, gameSystem: GameSystem.CALL_OF_CTHULHU_7E }, hp(0), viewer)).toBeNull();
    expect(characterTemporaryHp({ ...character, gameSystem: null }, hp(0), viewer)).toBeNull();
  });

  it('is not offered without hit points on its sheet', () => {
    expect(characterTemporaryHp(character, null, { userId: 'alice', role: CampaignRole.PLAYER })).toBeNull();
  });
});

describe('a token', () => {
  const campaign = {
    gameSystem: GameSystem.DND_5E,
    characters: [{ id: 'char-1', userId: 'alice', gameSystem: GameSystem.DND_5E }],
  };

  it("bound to a character grants the character's, by the character's rule", () => {
    const pc = token({ characterId: 'char-1', type: TokenType.PLAYER, controlledBy: 'alice', hp: null });
    expect(tokenTemporaryHp(pc, campaign, { 'char-1': hp(5) }, { userId: 'alice', role: CampaignRole.PLAYER }))
      .toEqual({ kind: 'character', characterId: 'char-1', current: 5, system: GameSystem.DND_5E });
    expect(tokenTemporaryHp(pc, campaign, { 'char-1': hp(5) }, { userId: 'bob', role: CampaignRole.PLAYER })).toBeNull();
    // A character that has left the campaign offers nothing.
    expect(tokenTemporaryHp({ ...pc, characterId: 'char-gone' }, campaign, {}, { userId: 'dm', role: CampaignRole.DM })).toBeNull();
  });

  it("of a creature grants the token's, to the DM alone, even when a player controls it", () => {
    const wolf = token({ controlledBy: 'alice' });
    expect(tokenTemporaryHp(wolf, campaign, {}, { userId: 'dm', role: CampaignRole.DM }))
      .toEqual({ kind: 'token', tokenId: 'tok-1', hp: hp(3), system: GameSystem.DND_5E });
    expect(tokenTemporaryHp(wolf, campaign, {}, { userId: 'alice', role: CampaignRole.PLAYER })).toBeNull();
  });

  it('of a creature with no hit points, or in Call of Cthulhu, offers nothing', () => {
    const dm = { userId: 'dm', role: CampaignRole.DM };
    expect(tokenTemporaryHp(token({ hp: null }), campaign, {}, dm)).toBeNull();
    expect(tokenTemporaryHp(token(), { ...campaign, gameSystem: GameSystem.CALL_OF_CTHULHU_7E }, {}, dm)).toBeNull();
  });
});
