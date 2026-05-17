/**
 * Permission Utilities
 */

import type { User, Character, CampaignMembership } from '../types';

/**
 * Check if a user can edit a character
 * @param user - Current user
 * @param character - Character to edit
 * @param membership - User's campaign membership (if viewing in campaign context)
 * @returns true if user can edit the character
 */
export function canEditCharacter(
  user: User,
  character: Character,
  membership?: CampaignMembership
): boolean {
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
  character: Character,
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
