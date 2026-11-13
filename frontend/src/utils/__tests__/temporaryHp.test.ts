/**
 * Who is offered Temporary HP..., and on what: the server's rules, so the
 * menus offer nothing the server refuses.
 *
 * A character's hit points are on its sheet, and its owner while a player
 * and the GM change them (character.hp.temporary). A creature's are its
 * token's, the GM's alone (the token update route). Only in 5E and
 * Fantasy d20, whose sheets keep temporary hit points, and only where there
 * are hit points to add them to.
 */

import { describe, it, expect } from 'vitest';
import { CampaignRole, GameSystem, TokenLayer, TokenType, type Token } from '@/types';
import { characterTemporaryHp, tokenTemporaryHp } from '../temporaryHp';

const hp = (temp: number) => ({ current: 10, max: 20, temp });
const character = { id: 'char-1', userId: 'alice', gameSystem: GameSystem.FIFTH_EDITION };

function token(extra: Partial<Token> = {}): Token {
  return {
    id: 'tok-1', name: 'Wolf', imageUrl: '', characterId: null, position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null,
    metadata: {}, disposition: null, hp: hp(3), showHpBar: false, initiative: null, ...extra,
  };
}

describe('a character', () => {
  it('is offered to its owner while a player, and to the GM, with what it has', () => {
    expect(characterTemporaryHp(character, hp(4), { userId: 'alice', role: CampaignRole.PLAYER }))
      .toEqual({ kind: 'character', characterId: 'char-1', current: 4, system: GameSystem.FIFTH_EDITION });
    expect(characterTemporaryHp(character, hp(4), { userId: 'dm', role: CampaignRole.GM })).not.toBeNull();
  });

  it('is not offered to another player, or to a spectator, even its owner', () => {
    expect(characterTemporaryHp(character, hp(4), { userId: 'bob', role: CampaignRole.PLAYER })).toBeNull();
    expect(characterTemporaryHp(character, hp(4), { userId: 'alice', role: CampaignRole.SPECTATOR })).toBeNull();
  });

  it('is offered in Fantasy d20, and not in Horror d100 or with no system', () => {
    const viewer = { userId: 'alice', role: CampaignRole.PLAYER };
    expect(characterTemporaryHp({ ...character, gameSystem: GameSystem.FANTASY_D20 }, hp(0), viewer)).not.toBeNull();
    expect(characterTemporaryHp({ ...character, gameSystem: GameSystem.HORROR_D100 }, hp(0), viewer)).toBeNull();
    expect(characterTemporaryHp({ ...character, gameSystem: null }, hp(0), viewer)).toBeNull();
  });

  it('is not offered without hit points on its sheet', () => {
    expect(characterTemporaryHp(character, null, { userId: 'alice', role: CampaignRole.PLAYER })).toBeNull();
  });
});

describe('a token', () => {
  const campaign = {
    gameSystem: GameSystem.FIFTH_EDITION,
    characters: [{ id: 'char-1', userId: 'alice', gameSystem: GameSystem.FIFTH_EDITION }],
  };

  it("bound to a character grants the character's, by the character's rule", () => {
    const pc = token({ characterId: 'char-1', type: TokenType.PLAYER, controlledBy: 'alice', hp: null });
    expect(tokenTemporaryHp(pc, campaign, { 'char-1': hp(5) }, { userId: 'alice', role: CampaignRole.PLAYER }))
      .toEqual({ kind: 'character', characterId: 'char-1', current: 5, system: GameSystem.FIFTH_EDITION });
    expect(tokenTemporaryHp(pc, campaign, { 'char-1': hp(5) }, { userId: 'bob', role: CampaignRole.PLAYER })).toBeNull();
    // A character that has left the campaign offers nothing.
    expect(tokenTemporaryHp({ ...pc, characterId: 'char-gone' }, campaign, {}, { userId: 'dm', role: CampaignRole.GM })).toBeNull();
  });

  it("of a creature grants the token's, to the GM alone, even when a player controls it", () => {
    const wolf = token({ controlledBy: 'alice' });
    expect(tokenTemporaryHp(wolf, campaign, {}, { userId: 'dm', role: CampaignRole.GM }))
      .toEqual({ kind: 'token', tokenId: 'tok-1', hp: hp(3), system: GameSystem.FIFTH_EDITION });
    expect(tokenTemporaryHp(wolf, campaign, {}, { userId: 'alice', role: CampaignRole.PLAYER })).toBeNull();
  });

  it('of a creature with no hit points, or in Horror d100, offers nothing', () => {
    const gm = { userId: 'dm', role: CampaignRole.GM };
    expect(tokenTemporaryHp(token({ hp: null }), campaign, {}, gm)).toBeNull();
    expect(tokenTemporaryHp(token(), { ...campaign, gameSystem: GameSystem.HORROR_D100 }, {}, gm)).toBeNull();
  });
});
