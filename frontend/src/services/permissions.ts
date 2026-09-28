/**
 * Permission Utilities
 */

import type { User, Character, CampaignMembership, Campaign } from '../types';

/**
 * Check if a user can edit a character
 * @param user - Current user
 * @param character - Character to edit
 * @param membership - User's campaign membership (if viewing in campaign context)
 * @returns true if user can edit the character
 */
export function canEditCharacter(
  user: User,
  character: Pick<Character, 'userId'>,
  membership?: Pick<CampaignMembership, 'role'>
): boolean {
  // A spectator may read the characters they own but not edit them while
  // they are a spectator in the character's campaign: a bound token follows
  // the sheet on every screen, and the server refuses the save.
  if (membership?.role === 'SPECTATOR') {
    return false;
  }

  // User owns the character
  if (character.userId === user.id) {
    return true;
  }

  // User is DM of the campaign
  if (membership && membership.role === 'DM') {
    return true;
  }

  return false;
}

/**
 * canEditCharacter for a page outside the campaign, which holds the
 * character's campaign as the user's campaign list gives it (with their role
 * in it) and no membership: the Characters page and the full editor. An
 * owner who is a spectator in that campaign may not edit, as the server
 * refuses the save.
 */
export function canEditCharacterIn(
  user: User,
  character: Pick<Character, 'userId'>,
  campaign: Pick<Campaign, 'userRole' | 'memberships'> | null | undefined
): boolean {
  const role = campaign ? (campaign.userRole ?? campaign.memberships?.find((m) => m.userId === user.id)?.role) : undefined;
  return canEditCharacter(user, character, role ? { role } : undefined);
}

/**
 * Check if a user can view a character
 * In campaign context, all members can view characters
 * @param user - Current user
 * @param character - Character to view
 * @param membership - User's campaign membership (if in campaign context)
 * @returns true if user can view the character
 */
export function canViewCharacter(
  user: User,
  character: Character,
  membership?: CampaignMembership
): boolean {
  // User owns the character
  if (character.userId === user.id) {
    return true;
  }

  // User is a member of the campaign (any role can view)
  if (membership) {
    return true;
  }

  return false;
}

/**
 * Check if a user can roll a character's dice
 *
 * Rolling uses the sheet's own modifiers, so it is an action taken *as* that
 * character rather than a way of reading one. The owner may, and the DM may so
 * they can cover for an absent player. Everyone else in the campaign — other
 * players and spectators alike — may still open and read the sheet, which the
 * server deliberately allows, but not roll from it.
 *
 * This is deliberately its own rule rather than a call to canEditCharacter.
 * The two happen to agree today, but "may change this sheet" and "may act as
 * this character" are different questions, and folding them together would
 * mean any future change to editing silently changed who can roll.
 *
 * @param user - Current user
 * @param character - Character whose rolls are being offered
 * @param membership - User's campaign membership (if in campaign context)
 * @returns true if user can roll as the character
 */
export function canRollAsCharacter(
  user: User,
  // Only ownership is read, and the roster's context menu holds the owner id
  // without the character object — so this takes the narrowest thing that
  // answers the question rather than making callers fetch a whole Character.
  character: Pick<Character, 'userId'>,
  membership?: CampaignMembership
): boolean {
  // A spectator is watching, not playing, even with a character of their own
  // in the roster; the server refuses the roll.
  if (membership?.role === 'SPECTATOR') {
    return false;
  }

  // User owns the character
  if (character.userId === user.id) {
    return true;
  }

  // User is DM of the campaign
  if (membership && membership.role === 'DM') {
    return true;
  }

  return false;
}

/**
 * Check if a user can reassign a character to another player
 * Only DMs can reassign characters
 * @param membership - User's campaign membership
 * @returns true if user can reassign characters
 */
export function canReassignCharacter(membership?: CampaignMembership): boolean {
  return membership?.role === 'DM';
}

/**
 * Check if a user can remove a character from a campaign
 * Character owners and DMs can remove characters
 * @param user - Current user
 * @param character - Character to remove
 * @param membership - User's campaign membership
 * @returns true if user can remove the character
 */
export function canRemoveCharacterFromCampaign(
  user: User,
  character: Pick<Character, 'userId'>,
  membership?: CampaignMembership
): boolean {
  // User owns the character
  if (character.userId === user.id) {
    return true;
  }

  // User is DM
  if (membership?.role === 'DM') {
    return true;
  }

  return false;
}
