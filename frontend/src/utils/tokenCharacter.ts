import type { Campaign, Token, User } from '@/types';
import { canRollAsCharacter } from '@/services/permissions';

/**
 * What a token's character offers this viewer: its sheet, and rolls from it.
 *
 * The map's right-click menu and the initiative tracker's offer the same two
 * entries for a token, so both ask here.
 */

type CampaignCharacters = Pick<Campaign, 'characters' | 'memberships'> | null | undefined;

/**
 * Whether a character is one of this campaign's, as the campaign was loaded.
 * Every member may read such a sheet, and it opens in this campaign, so it is
 * shown Edit by this campaign's role. A token keeps its character after the
 * character leaves, and then offers no sheet.
 */
export function campaignHasCharacter(campaign: CampaignCharacters, characterId: string | null | undefined): boolean {
  if (!characterId) return false;
  return campaign?.characters?.some((c) => c.id === characterId) ?? false;
}

/**
 * Whether this viewer may roll a token's character sheet. Keyed on who owns
 * the character, not on `token.controlledBy`: the rolls come from the sheet,
 * and the roster and the sheet viewer offer the same rolls with no token in
 * hand (see services/permissions).
 */
export function canRollTokenCharacter(
  user: User | null | undefined,
  campaign: CampaignCharacters,
  token: Pick<Token, 'characterId'>,
): boolean {
  if (!user || !token.characterId) return false;
  const character = campaign?.characters?.find((c) => c.id === token.characterId);
  if (!character) return false;
  const membership = campaign?.memberships?.find((m) => m.userId === user.id);
  return canRollAsCharacter(user, character, membership);
}
