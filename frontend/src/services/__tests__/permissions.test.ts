/**
 * Who may roll a character's dice.
 *
 * Issue #42: the roll menu was gated on a token merely having a character,
 * so a player could open another player's sheet rolls and roll with their
 * modifiers. Three separate call sites each decided this for themselves and
 * only the initiative one got it right, which is why the rule lives here now
 * and every caller imports it.
 *
 * The fixtures are narrowed to the fields the predicate actually reads.
 */

import { describe, it, expect } from 'vitest';

import { canRollAsCharacter } from '../permissions';
import { CampaignRole } from '@/types';
import type { User, CampaignMembership } from '@/types';

const OWNER = 'user-owner';
const OTHER = 'user-other';

const user = (id: string) => ({ id }) as unknown as User;
const character = (userId: string) => ({ userId });
const membership = (role: CampaignRole) => ({ role }) as unknown as CampaignMembership;

describe('canRollAsCharacter', () => {
  it('lets the owner roll their own character', () => {
    expect(
      canRollAsCharacter(user(OWNER), character(OWNER), membership(CampaignRole.PLAYER))
    ).toBe(true);
  });

  it('lets the DM roll for anyone, so they can cover an absent player', () => {
    expect(
      canRollAsCharacter(user(OTHER), character(OWNER), membership(CampaignRole.DM))
    ).toBe(true);
  });

  it('refuses a player rolling another player’s character', () => {
    expect(
      canRollAsCharacter(user(OTHER), character(OWNER), membership(CampaignRole.PLAYER))
    ).toBe(false);
  });

  it('refuses a spectator, who is watching rather than playing', () => {
    expect(
      canRollAsCharacter(user(OTHER), character(OWNER), membership(CampaignRole.SPECTATOR))
    ).toBe(false);
  });

  it('refuses when there is no campaign membership at all', () => {
    expect(canRollAsCharacter(user(OTHER), character(OWNER), undefined)).toBe(false);
  });

  it('still lets the owner roll outside any campaign context', () => {
    expect(canRollAsCharacter(user(OWNER), character(OWNER), undefined)).toBe(true);
  });
});
