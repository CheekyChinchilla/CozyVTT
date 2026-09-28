/**
 * Telling the DM apart from the owner.
 *
 * Once the DM seat could be handed over, five places that had each worked out
 * "the DM" by looking up the campaign's *owner* started naming the wrong
 * person: the dashboard card and the campaign info panel both printed the
 * previous DM under a "DM:" label, the character editor granted its DM-only
 * edit to the previous DM, and the asset picker offered campaign scope to them
 * rather than to whoever now runs the game.
 *
 * The cases below are written around a campaign whose owner is NOT its DM,
 * because a campaign where they coincide cannot tell the two answers apart —
 * which is precisely how the confusion survived for so long.
 */

import { describe, it, expect } from 'vitest';
import { CampaignRole } from '@/types';
import type { Campaign, CampaignMembership } from '@/types';
import {
  campaignDmMembership,
  campaignOwnerMembership,
  campaignDmName,
  campaignOwnerName,
  ownerDiffersFromDm,
  isCampaignOwner,
  isCampaignDm,
  campaignsToPlaceAssetIn,
  withMemberRole,
} from '../campaignRoles';

const member = (
  userId: string,
  role: CampaignMembership['role'],
  displayName: string
): CampaignMembership =>
  ({
    id: `m-${userId}`,
    userId,
    campaignId: 'c1',
    role,
    characterIds: [],
    joinedAt: '2026-01-01T00:00:00.000Z',
    user: { id: userId, displayName },
  }) as unknown as CampaignMembership;

/** Handed over: 'creator' still owns it, 'runner' now runs it. */
const handedOver = {
  id: 'c1',
  ownerId: 'creator',
  memberships: [
    member('creator', CampaignRole.PLAYER, 'Original Creator'),
    member('runner', CampaignRole.DM, 'New Storyteller'),
    member('bystander', CampaignRole.PLAYER, 'Someone Else'),
  ],
} as unknown as Campaign;

/** The ordinary case, where the creator still runs it. */
const untouched = {
  id: 'c2',
  ownerId: 'creator',
  memberships: [
    member('creator', CampaignRole.DM, 'Original Creator'),
    member('bystander', CampaignRole.PLAYER, 'Someone Else'),
  ],
} as unknown as Campaign;

describe('campaignRoles', () => {
  describe('after a handover', () => {
    it('names the DM as the person now running it', () => {
      expect(campaignDmName(handedOver)).toBe('New Storyteller');
    });

    it('still names the creator as the owner', () => {
      expect(campaignOwnerName(handedOver)).toBe('Original Creator');
    });

    it('finds the DM by role, not by matching ownerId', () => {
      expect(campaignDmMembership(handedOver)?.userId).toBe('runner');
      expect(campaignOwnerMembership(handedOver)?.userId).toBe('creator');
    });

    it('reports that the owner and the DM have come apart', () => {
      expect(ownerDiffersFromDm(handedOver)).toBe(true);
    });

    it('treats the new DM as the DM and the old one as not', () => {
      expect(isCampaignDm(handedOver, 'runner')).toBe(true);
      expect(isCampaignDm(handedOver, 'creator')).toBe(false);
    });

    it('keeps ownership with the creator regardless of who runs it', () => {
      expect(isCampaignOwner(handedOver, 'creator')).toBe(true);
      expect(isCampaignOwner(handedOver, 'runner')).toBe(false);
    });
  });

  describe('a campaign nobody has handed over', () => {
    it('gives the same name for both, and says they do not differ', () => {
      expect(campaignDmName(untouched)).toBe('Original Creator');
      expect(campaignOwnerName(untouched)).toBe('Original Creator');
      expect(ownerDiffersFromDm(untouched)).toBe(false);
    });
  });

  describe('incomplete data', () => {
    it('falls back to a placeholder rather than throwing when memberships are absent', () => {
      const summary = { id: 'c3', ownerId: 'creator' } as unknown as Campaign;
      expect(campaignDmName(summary)).toBe('Unknown');
      expect(campaignOwnerName(summary)).toBe('Unknown');
    });

    it('claims no divergence when there is no DM row to compare against', () => {
      const dmless = {
        id: 'c4',
        ownerId: 'creator',
        memberships: [member('creator', CampaignRole.PLAYER, 'Original Creator')],
      } as unknown as Campaign;
      expect(ownerDiffersFromDm(dmless)).toBe(false);
    });

    it('handles null and undefined campaigns', () => {
      expect(campaignDmName(null)).toBe('Unknown');
      expect(ownerDiffersFromDm(undefined)).toBe(false);
      expect(isCampaignDm(null, 'runner')).toBe(false);
      expect(isCampaignOwner(undefined, 'creator')).toBe(false);
    });

    it('answers no for an anonymous viewer', () => {
      expect(isCampaignDm(handedOver, null)).toBe(false);
      expect(isCampaignOwner(handedOver, undefined)).toBe(false);
    });
  });

  describe('the server\'s own userRole wins when present', () => {
    it('trusts userRole over the membership list', () => {
      // A summary payload may carry userRole without full memberships.
      const summary = { id: 'c5', ownerId: 'creator', userRole: 'DM' } as unknown as Campaign;
      expect(isCampaignDm(summary, 'anyone')).toBe(true);
    });

    it('does not call someone a DM when the server said otherwise', () => {
      const summary = { id: 'c6', ownerId: 'creator', userRole: 'PLAYER' } as unknown as Campaign;
      expect(isCampaignDm(summary, 'creator')).toBe(false);
    });
  });
});

// Putting an asset into a campaign is the DM's, with token art the one thing
// a player may bring in; a spectator brings in nothing. The server decides
// this (canPlaceAssetAtScope); the pickers offer only what it accepts.
describe('campaignsToPlaceAssetIn', () => {
  const watched = {
    id: 'c3',
    ownerId: 'creator',
    memberships: [member('creator', CampaignRole.DM, 'Original Creator'), member('watcher', CampaignRole.SPECTATOR, 'Watcher')],
  } as unknown as Campaign;
  const all = [handedOver, untouched, watched];
  const ids = (list: Campaign[]) => list.map((c) => c.id);

  it('offers token art in the campaigns someone runs or plays in, and none they only watch', () => {
    expect(ids(campaignsToPlaceAssetIn(all, true, 'bystander'))).toEqual(['c1', 'c2']);
    expect(ids(campaignsToPlaceAssetIn(all, true, 'watcher'))).toEqual([]);
  });

  it('offers any other asset only in the campaigns someone runs, whoever owns them', () => {
    expect(ids(campaignsToPlaceAssetIn(all, false, 'runner'))).toEqual(['c1']);
    // The creator handed c1 over and runs c2 and c3.
    expect(ids(campaignsToPlaceAssetIn(all, false, 'creator'))).toEqual(['c2', 'c3']);
    expect(ids(campaignsToPlaceAssetIn(all, false, 'bystander'))).toEqual([]);
  });
});

// A role change mid-session is patched into the open page's membership list,
// which every "may I?" on the page reads.
describe('withMemberRole', () => {
  it("changes that member's role and leaves everyone else's", () => {
    const changed = withMemberRole(untouched, 'bystander', CampaignRole.SPECTATOR);
    expect(changed.memberships?.find((m) => m.userId === 'bystander')?.role).toBe(CampaignRole.SPECTATOR);
    expect(changed.memberships?.find((m) => m.userId === 'creator')?.role).toBe(CampaignRole.DM);
  });

  it("updates the page's own role when it is the viewer who changed", () => {
    const mine = { ...untouched, userRole: CampaignRole.PLAYER } as unknown as Campaign;
    expect(withMemberRole(mine, 'bystander', CampaignRole.SPECTATOR, 'bystander').userRole).toBe(CampaignRole.SPECTATOR);
    expect(withMemberRole(mine, 'creator', CampaignRole.PLAYER, 'bystander').userRole).toBe(CampaignRole.PLAYER);
  });

  it('returns the same campaign when nothing changes', () => {
    expect(withMemberRole(untouched, 'bystander', CampaignRole.PLAYER)).toBe(untouched);
    expect(withMemberRole(untouched, 'nobody', CampaignRole.DM)).toBe(untouched);
  });
});

