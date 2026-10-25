/**
 * What a token's character offers a viewer, as the map's and the initiative
 * tracker's menus both ask it.
 */

import { describe, it, expect } from 'vitest';
import { campaignHasCharacter, canRollTokenCharacter } from '../tokenCharacter';
import type { Campaign, CampaignMembership, Character, User } from '@/types';
import { CampaignRole } from '@/types';

const user = (id: string) => ({ id, platformRole: 'USER' }) as User;
const campaign = (role: CampaignRole) => ({
  characters: [{ id: 'char-alice', userId: 'alice' }, { id: 'char-bob', userId: 'bob' }] as Character[],
  memberships: [{ userId: 'alice', role }] as CampaignMembership[],
}) as Pick<Campaign, 'characters' | 'memberships'>;

describe('campaignHasCharacter', () => {
  it("is true for one of the campaign's characters, and false for any other or none", () => {
    expect(campaignHasCharacter(campaign(CampaignRole.PLAYER), 'char-bob')).toBe(true);
    expect(campaignHasCharacter(campaign(CampaignRole.PLAYER), 'char-gone')).toBe(false);
    expect(campaignHasCharacter(campaign(CampaignRole.PLAYER), null)).toBe(false);
    expect(campaignHasCharacter(undefined, 'char-bob')).toBe(false);
  });
});

describe('canRollTokenCharacter', () => {
  it("lets a player roll their own character and not another's", () => {
    expect(canRollTokenCharacter(user('alice'), campaign(CampaignRole.PLAYER), { characterId: 'char-alice' })).toBe(true);
    expect(canRollTokenCharacter(user('alice'), campaign(CampaignRole.PLAYER), { characterId: 'char-bob' })).toBe(false);
  });

  it('lets the DM roll any character of the campaign', () => {
    expect(canRollTokenCharacter(user('alice'), campaign(CampaignRole.DM), { characterId: 'char-bob' })).toBe(true);
  });

  it('gives a spectator no rolls, even of their own character', () => {
    expect(canRollTokenCharacter(user('alice'), campaign(CampaignRole.SPECTATOR), { characterId: 'char-alice' })).toBe(false);
  });

  it('gives no rolls for a token with no character, or one that has left', () => {
    expect(canRollTokenCharacter(user('alice'), campaign(CampaignRole.DM), { characterId: null })).toBe(false);
    expect(canRollTokenCharacter(user('alice'), campaign(CampaignRole.DM), { characterId: 'char-gone' })).toBe(false);
    expect(canRollTokenCharacter(null, campaign(CampaignRole.DM), { characterId: 'char-bob' })).toBe(false);
  });
});
