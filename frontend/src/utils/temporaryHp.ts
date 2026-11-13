/**
 * Who is offered Temporary HP..., and on what.
 *
 * The roster's menu and the token menu offer it by the server's rules, so
 * neither offers what the server refuses. A character's hit points are on its
 * sheet, and its owner while a player and the GM change them
 * (character.hp.temporary), as the roster's damage buttons do. A creature's
 * are its token's, and only the GM changes a token's hit points (the token
 * update route). Only in a system whose sheet keeps temporary hit points
 * (utils/rules/hitPoints), and only where there are hit points to add them to.
 */

import { CampaignRole, type GameSystem, type Token, type TokenHp } from '@/types';
import type { CharacterHpInfo } from './characterHp';
import { grantTemporaryHitPoints } from './rules/hitPoints';
import { playedGameSystem } from '@/constants/game-systems';

/** What Temporary HP... grants to: a character's sheet, or a creature's token. */
export type TemporaryHpTarget =
  | { kind: 'character'; characterId: string; current: number; system: GameSystem | null }
  | { kind: 'token'; tokenId: string; hp: TokenHp; system: GameSystem | null };

interface Viewer {
  userId: string | undefined;
  role: CampaignRole | null | undefined;
}

interface CharacterSummary {
  id: string;
  userId: string;
  gameSystem: GameSystem | null;
}

const hasTemporaryHp = (system: GameSystem | null | undefined): boolean => grantTemporaryHitPoints(0, 1, system) !== null;

/** A character's temporary hit points, when this viewer may grant them. */
export function characterTemporaryHp(
  character: CharacterSummary,
  hp: CharacterHpInfo | null | undefined,
  viewer: Viewer,
): TemporaryHpTarget | null {
  if (!hp || !hasTemporaryHp(character.gameSystem)) return null;
  const mayChange = viewer.role === CampaignRole.GM || (viewer.role === CampaignRole.PLAYER && character.userId === viewer.userId);
  if (!mayChange) return null;
  return { kind: 'character', characterId: character.id, current: hp.temp, system: character.gameSystem };
}

/**
 * A token's temporary hit points, when this viewer may grant them: its
 * character's, for a token bound to one of the campaign's, and otherwise the
 * token's own.
 */
export function tokenTemporaryHp(
  token: Token,
  campaign: { gameSystem: GameSystem | null; characters?: CharacterSummary[] } | null | undefined,
  characterHp: Record<string, CharacterHpInfo>,
  viewer: Viewer,
): TemporaryHpTarget | null {
  if (token.characterId) {
    const character = campaign?.characters?.find((c) => c.id === token.characterId);
    return character ? characterTemporaryHp(character, characterHp[character.id], viewer) : null;
  }
  // A campaign of a system CozyVTT no longer supports is played as one with none.
  const system = playedGameSystem(campaign?.gameSystem);
  if (viewer.role !== CampaignRole.GM || !token.hp || !hasTemporaryHp(system)) return null;
  return { kind: 'token', tokenId: token.id, hp: token.hp, system };
}
