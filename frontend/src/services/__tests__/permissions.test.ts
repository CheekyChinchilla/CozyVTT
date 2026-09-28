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

import { canEditCharacter, canEditCharacterIn, canRollAsCharacter, characterEditRefusal } from '../permissions';
import { CampaignRole } from '@/types';
import type { User, CampaignMembership, Campaign } from '@/types';

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

  it('refuses a spectator rolling even their own character, as the server does', () => {
    expect(
      canRollAsCharacter(user(OWNER), character(OWNER), membership(CampaignRole.SPECTATOR))
    ).toBe(false);
  });

  it('refuses when there is no campaign membership at all', () => {
    expect(canRollAsCharacter(user(OTHER), character(OWNER), undefined)).toBe(false);
  });

  it('still lets the owner roll outside any campaign context', () => {
    expect(canRollAsCharacter(user(OWNER), character(OWNER), undefined)).toBe(true);
  });
});

/**
 * Who may change a sheet. A spectator may read the characters they own but
 * not edit them while they are a spectator in the character's campaign: the
 * server refuses the save, since a bound token follows the sheet on every
 * screen, and the controls should not offer what will be refused.
 */
describe('canEditCharacter', () => {
  it('lets a player edit their own character', () => {
    expect(canEditCharacter(user(OWNER), character(OWNER), membership(CampaignRole.PLAYER))).toBe(true);
  });

  it('lets the DM edit anyone\'s', () => {
    expect(canEditCharacter(user(OTHER), character(OWNER), membership(CampaignRole.DM))).toBe(true);
  });

  it('refuses another player', () => {
    expect(canEditCharacter(user(OTHER), character(OWNER), membership(CampaignRole.PLAYER))).toBe(false);
  });

  it('refuses a spectator, even on their own character', () => {
    expect(canEditCharacter(user(OWNER), character(OWNER), membership(CampaignRole.SPECTATOR))).toBe(false);
  });

  it('lets the owner edit outside any campaign context', () => {
    expect(canEditCharacter(user(OWNER), character(OWNER), undefined)).toBe(true);
  });
});

/**
 * The same rule from outside the campaign: the Characters page and the full
 * editor hold the character's campaign (with the user's role in it), not a
 * membership. They offered Edit to an owner who is a spectator there, and
 * the save was refused.
 */
describe('canEditCharacterIn', () => {
  const campaign = (userRole?: CampaignRole, memberships: Array<{ userId: string; role: CampaignRole }> = []) =>
    ({ userRole, memberships }) as unknown as Campaign;

  it('refuses an owner who is a spectator in the character\'s campaign', () => {
    expect(canEditCharacterIn(user(OWNER), character(OWNER), campaign(CampaignRole.SPECTATOR))).toBe(false);
    expect(canEditCharacterIn(user(OWNER), character(OWNER), campaign(undefined, [{ userId: OWNER, role: CampaignRole.SPECTATOR }]))).toBe(false);
  });

  it('lets an owner who plays in it, or whose character is in no campaign, edit', () => {
    expect(canEditCharacterIn(user(OWNER), character(OWNER), campaign(CampaignRole.PLAYER))).toBe(true);
    expect(canEditCharacterIn(user(OWNER), character(OWNER), null)).toBe(true);
  });

  it("lets the campaign's DM edit someone else's character, and nobody else", () => {
    expect(canEditCharacterIn(user(OTHER), character(OWNER), campaign(CampaignRole.DM))).toBe(true);
    expect(canEditCharacterIn(user(OTHER), character(OWNER), campaign(CampaignRole.PLAYER))).toBe(false);
  });
});


// A refused owner is refused for being a spectator in the character's
// campaign, and was told only the owner could edit it.
describe('characterEditRefusal', () => {
  it('tells an owner the refusal is for being a spectator there', () => {
    expect(characterEditRefusal(user(OWNER), character(OWNER))).toMatch(/spectator/);
  });

  it('tells anyone else who may edit', () => {
    expect(characterEditRefusal(user(OTHER), character(OWNER))).toMatch(/owner or the DM/);
  });
});
