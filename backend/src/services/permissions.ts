import { CampaignRole, PlatformRole, AssetType, AssetScope } from '@prisma/client';
import { prisma } from '../config/database';
import { readTokens } from '../utils/prisma-json';
import { getSpiritVisibility } from '../utils/spirit-layer';
import { extractAssetId } from '../utils/asset-urls';

/**
 * Permission Verification Helpers
 * Role & Permission Model
 * Server-side permission checks for business logic
 */

/**
 * Check if user is an admin
 */
export function isAdmin(platformRole: PlatformRole): boolean {
  return platformRole === 'ADMIN';
}

/**
 * Check if user is DM of a campaign
 */
export function isDM(campaignRole: CampaignRole): boolean {
  return campaignRole === 'DM';
}

/**
 * Check if user is Player in a campaign
 */
export function isPlayer(campaignRole: CampaignRole): boolean {
  return campaignRole === 'PLAYER';
}

/**
 * Check if user can edit campaign settings
 * Only DM can edit campaign
 */
export function canEditCampaign(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can edit a specific character
 * 
 * - Players can edit own characters
 * - DM can edit any character in campaign
 * - Admin can edit any character
 */
export async function canEditCharacter(
  userId: string,
  characterId: string,
  campaignId: string,
  platformRole: PlatformRole
): Promise<boolean> {
  // Admins can edit anything
  if (isAdmin(platformRole)) {
    return true;
  }

  // Get character
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return false;
  }

  // Owner can always edit their own character
  if (character.userId === userId) {
    return true;
  }

  // Check if user is DM of the campaign
  const membership = await prisma.campaignMembership.findUnique({
    where: {
      userId_campaignId: {
        userId,
        campaignId,
      },
    },
  });

  if (membership && isDM(membership.role)) {
    return true;
  }

  return false;
}

/**
 * May this member act on this token: move it, and change the fields a player
 * is allowed to change.
 *
 * The DM always; a player only when the token names them in `controlledBy`;
 * a spectator never. That last clause is why `controlledBy` alone is not the
 * test: it is set once and not cleared when someone is demoted, so a spectator
 * can still hold a token from before. One predicate for the REST update route
 * and the three socket move handlers, so the channels cannot drift apart.
 */
export function canControlToken(
  role: string | undefined,
  controlledBy: string | null | undefined,
  userId: string | undefined
): boolean {
  if (role === 'DM') return true;
  return role === 'PLAYER' && !!userId && controlledBy === userId;
}

/**
 * May this member be given tokens to control: a player of the campaign, and
 * nobody else. The DM controls every token without being named on one, and
 * a spectator controls nothing, so `controlledBy` may only ever name a
 * player. Asked before a token is created or handed over, and before a
 * character's owner is made the default controller of a token bound to it,
 * so a spectator is never named on a token from now on; one still named from
 * their time as a player is treated as nobody's by `canControlToken` above
 * and by `viewerIdFor` in `utils/spirit-layer.ts`.
 */
export async function canHoldTokens(campaignId: string, userId: string): Promise<boolean> {
  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  return membership?.role === 'PLAYER';
}

/**
 * May this member move tokens right now. The DM always: setting the scene
 * between sessions is theirs. A player not while the session is paused or
 * has ended, which is what the client greys the drag out for and the guides
 * promise; until the server asked too, a scripted client moved its token
 * straight through a pause. The same statuses the client checks, so the two
 * cannot disagree. Asked by the three move events and the REST token update.
 */
export function canMoveTokensNow(role: string | undefined, campaignStatus: string): boolean {
  if (role === 'DM') return true;
  return campaignStatus !== 'PAUSED' && campaignStatus !== 'INACTIVE';
}

/** What both channels answer a player who moves during a pause. */
export const PAUSED_MOVE_REFUSAL = 'Players cannot move tokens while the session is paused or ended';

/**
 * Check if user can manage campaign maps
 * Only DM can manage maps
 */
export function canManageMaps(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can toggle Spirit Layer
 * Only DM can toggle Spirit Layer
 */
export function canToggleSpiritLayer(
  campaignRole: CampaignRole,
  platformRole: PlatformRole
): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can change vibe tracker
 * Only DM can change time of day
 */
export function canChangeVibe(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can manage campaign sessions
 * Only DM can start/pause/end sessions
 */
export function canManageSessions(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can invite players to campaign
 * Only campaign owner (DM) can invite
 */
export async function canInvitePlayers(
  userId: string,
  campaignId: string,
  platformRole: PlatformRole
): Promise<boolean> {
  // Admins can invite to any campaign
  if (isAdmin(platformRole)) {
    return true;
  }

  // Check if user is the campaign owner
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return false;
  }

  return campaign.ownerId === userId;
}

/**
 * Check if user can delete a campaign
 * Only campaign owner or admin
 */
export async function canDeleteCampaign(
  userId: string,
  campaignId: string,
  platformRole: PlatformRole
): Promise<boolean> {
  // Admins can delete any campaign
  if (isAdmin(platformRole)) {
    return true;
  }

  // Check if user is the campaign owner
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return false;
  }

  return campaign.ownerId === userId;
}

/**
 * Check whether a user may hand the DM seat to another member.
 *
 * Three people can, and they are not the same person by necessity:
 * - the sitting DM, handing off deliberately;
 * - the campaign owner, who keeps this even while playing as a player, so a
 *   campaign they own cannot be locked away from them by whoever holds the seat;
 * - a platform admin, the escape hatch for a DM who left without handing over.
 *
 * Ownership and the DM role are separate facts and a transfer moves only the
 * role, so the owner check reads `ownerId` and the DM check reads the
 * membership. Deliberately not the `campaignDM` middleware: that loads the
 * caller's membership first and refuses a non-member outright, which would shut
 * out an admin who is not at the table.
 */
export async function canTransferDM(
  userId: string,
  campaignId: string,
  platformRole: PlatformRole
): Promise<boolean> {
  if (isAdmin(platformRole)) {
    return true;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { ownerId: true },
  });

  if (!campaign) {
    return false;
  }

  if (campaign.ownerId === userId) {
    return true;
  }

  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });

  return membership?.role === 'DM';
}

/**
 * Who may roll dice: the DM and players. A spectator watches, and may talk in
 * chat, but a roll of theirs would land in the table's log and history. Takes
 * the socket's role as stored, a plain string, like canControlToken.
 */
export function canRollDice(campaignRole: string | undefined): boolean {
  return campaignRole === 'DM' || campaignRole === 'PLAYER';
}

/**
 * Who may open or close a door: the DM and players. A spectator watches the
 * map and does not touch it. The DM may also move, redraw or lock a door, and
 * change any other wall; a player may change nothing about a door but whether
 * it is open, which the wall handler enforces on top of this. Takes the
 * socket's role as stored, a plain string, like canRollDice.
 */
export function canToggleDoor(campaignRole: string | undefined): boolean {
  return campaignRole === 'DM' || campaignRole === 'PLAYER';
}

/**
 * Check if user can delete chat messages
 * Only DM can delete messages
 */
export function canDeleteMessages(campaignRole: CampaignRole, platformRole: PlatformRole): boolean {
  return isDM(campaignRole) || isAdmin(platformRole);
}

/**
 * Check if user can export campaign data
 * Campaign owner (DM) and Admin
 */
export async function canExportCampaign(
  userId: string,
  campaignId: string,
  platformRole: PlatformRole
): Promise<boolean> {
  // Admins can export any campaign
  if (isAdmin(platformRole)) {
    return true;
  }

  // Check if user is the campaign owner
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    return false;
  }

  return campaign.ownerId === userId;
}

/**
 * The answer also carries the campaign the asset may be filed under, because
 * `campaignId` is what decides which campaign lists an asset and a caller's own
 * value cannot be trusted for that. Only a CAMPAIGN-scoped asset has one.
 */
export type ScopeDecision =
  | { allowed: true; campaignId: string | null }
  | { allowed: false; status: 400 | 403; message: string };

/**
 * Whether a user may place a new asset at a scope.
 *
 * The single rule for anything that creates an asset row, whether by uploading
 * a file or by typing a document. It used to live inline in the upload route,
 * and the document-creation route would have needed a copy.
 *
 * - USER: anyone signed in, into their own library.
 * - GLOBAL: an admin, or a user granted globalAssetManager.
 * - CAMPAIGN: the campaign's DM. Tokens are the one exception, because a player
 *   uploads their own character's token art.
 *
 * Returns the refusal's status and message so a caller can answer exactly as
 * the upload route always has.
 */
export async function canPlaceAssetAtScope(
  userId: string,
  type: AssetType,
  scope: AssetScope,
  campaignId: string | undefined
): Promise<ScopeDecision> {
  if (scope === 'USER') {
    return { allowed: true, campaignId: null };
  }

  if (scope === 'GLOBAL') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { platformRole: true, globalAssetManager: true },
    });
    if (user?.platformRole !== 'ADMIN' && !user?.globalAssetManager) {
      return {
        allowed: false,
        status: 403,
        message: 'Only administrators or global asset managers can upload GLOBAL assets',
      };
    }
    return { allowed: true, campaignId: null };
  }

  // CAMPAIGN
  if (!campaignId) {
    return { allowed: false, status: 400, message: 'Campaign ID is required for CAMPAIGN scope' };
  }
  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });
  if (!membership) {
    return { allowed: false, status: 403, message: 'You do not have access to this campaign' };
  }
  // A player may add token art, since they upload their own character's; a
  // spectator adds nothing to a campaign's library.
  if (membership.role !== 'DM' && !(type === 'TOKEN' && membership.role === 'PLAYER')) {
    return {
      allowed: false,
      status: 403,
      message: 'Only the Dungeon Master can upload campaign assets',
    };
  }
  return { allowed: true, campaignId };
}

/**
 * The spirit-layer images a user may not see in the given campaigns: the
 * spirit plane of a map is shown to a player only once they have crossed
 * over (or the DM has opened it to everyone), and the asset library must not
 * hand them the picture the map itself withholds. The DM's campaigns hide
 * nothing. Returns asset ids, for a listing to leave out.
 */
export async function spiritLayerAssetIdsHiddenFrom(userId: string, campaignIds: string[]): Promise<string[]> {
  if (campaignIds.length === 0) return [];
  const memberships = await prisma.campaignMembership.findMany({
    where: { userId, campaignId: { in: campaignIds } },
    select: { campaignId: true, role: true },
  });
  const hidden: string[] = [];
  for (const m of memberships) {
    if (m.role === 'DM') continue;
    if (await getSpiritVisibility(m.campaignId, userId)) continue;
    const maps = await prisma.map.findMany({
      where: { campaignId: m.campaignId, spiritLayerUrl: { not: null } },
      select: { spiritLayerUrl: true },
    });
    for (const map of maps) {
      const id = extractAssetId(map.spiritLayerUrl);
      if (id) hidden.push(id);
    }
  }
  return hidden;
}

/** Whether `assetId` is a spirit-layer image of a map in `campaignId` that `userId` may not see there. */
async function spiritLayerHidesAsset(assetId: string, campaignId: string, userId: string): Promise<boolean> {
  const asSpiritLayer = await prisma.map.findFirst({
    where: { campaignId, spiritLayerUrl: { contains: assetId } },
    select: { id: true },
  });
  if (!asSpiritLayer) return false;
  // Shown openly somewhere on the same campaign's maps: nothing to keep.
  const asBaseLayer = await prisma.map.findFirst({
    where: { campaignId, OR: [{ imageUrl: { contains: assetId } }, { baseLayerUrl: { contains: assetId } }] },
    select: { id: true },
  });
  if (asBaseLayer) return false;
  return !(await getSpiritVisibility(campaignId, userId));
}

/**
 * Check whether something in a campaign this user belongs to uses an asset.
 *
 * Access to an image follows its **use**, not only its upload. A DM may pick a
 * map out of their own asset library — the picker lists personal assets with no
 * campaign filter — and that map then *is* the campaign's battlemap. Until this
 * existed, every player got 403 on it and saw "Failed to load map image", and
 * token art fell back to plain initial circles for the same reason. The
 * campaign's atmosphere track is the same story in sound: the DM picks it, each
 * player's browser fetches it, and a personal track was silent for everyone
 * but the DM.
 *
 * Deliberately not solved by re-scoping the asset to the campaign on use:
 * `Asset.scope` carries a single campaignId, and one map is commonly shared by
 * several campaigns at once, so promoting it would break the others.
 *
 * This grants READ only. Who may edit or delete an asset is decided elsewhere
 * and is unchanged — being able to see the battlemap must not mean being able
 * to delete it.
 *
 * The asset id is matched as a substring of the stored URL, which is the shape
 * everything writes (`/api/assets/maps/<id>`). Ids are UUIDs, so a partial
 * collision is not a practical concern.
 */
export async function assetUsedInUserCampaign(
  assetId: string,
  userId: string,
  uploaderId: string | null
): Promise<boolean> {
  // The owner has to be in the room too.
  //
  // Without this, "used in a campaign you belong to" meant "named by any row
  // you can write" — and nothing stops someone creating a campaign of their own
  // and a map whose imageUrl is a stranger's asset id, which the map route
  // formats but never checks. Referencing an asset therefore granted the right
  // to read it. Requiring the uploader's membership expresses what the rule was
  // always meant to say: you see an asset because somebody who has it brought
  // it somewhere you both are.
  //
  // A null uploader (their account was deleted) grants nothing, deliberately —
  // there is no longer anyone whose access is being shared.
  if (!uploaderId) return false;

  const [viewerIn, uploaderIn] = await Promise.all([
    prisma.campaignMembership.findMany({ where: { userId }, select: { campaignId: true } }),
    prisma.campaignMembership.findMany({ where: { userId: uploaderId }, select: { campaignId: true } }),
  ]);

  const uploaderCampaigns = new Set(uploaderIn.map((m) => m.campaignId));
  const campaignIds = viewerIn
    .map((m) => m.campaignId)
    .filter((id) => uploaderCampaigns.has(id));

  if (campaignIds.length === 0) return false;

  // A map's own layers first: that is the common case, and it answers without
  // reading any JSON. The spirit layer counts only where the viewer may see
  // that plane; the map keeps it from everyone else, and so does this.
  const mapLayer = await prisma.map.findFirst({
    where: {
      campaignId: { in: campaignIds },
      OR: [{ imageUrl: { contains: assetId } }, { baseLayerUrl: { contains: assetId } }],
    },
    select: { id: true },
  });
  if (mapLayer) return true;
  const spiritLayers = await prisma.map.findMany({
    where: { campaignId: { in: campaignIds }, spiritLayerUrl: { contains: assetId } },
    select: { campaignId: true },
  });
  for (const map of new Set(spiritLayers.map((m) => m.campaignId))) {
    if (await getSpiritVisibility(map, userId)) return true;
  }

  const [character, creature, tokenTemplate] = await Promise.all([
    prisma.character.findFirst({
      where: { campaignId: { in: campaignIds }, tokenImageUrl: { contains: assetId } },
      select: { id: true },
    }),
    prisma.creatureTemplate.findFirst({
      where: { campaignId: { in: campaignIds }, imageUrl: { contains: assetId } },
      select: { id: true },
    }),
    prisma.tokenTemplate.findFirst({
      where: { campaignId: { in: campaignIds }, imageUrl: { contains: assetId } },
      select: { id: true },
    }),
  ]);
  if (character || creature || tokenTemplate) return true;

  // The track a campaign is playing. The DM sets it and every player's browser
  // fetches it, so it is used by the whole table for as long as it is set.
  // Stored inside the campaign's vibeSettings JSON.
  const ambience = await prisma.campaign.findFirst({
    where: {
      id: { in: campaignIds },
      vibeSettings: { path: ['atmosphereAudio', 'assetId'], equals: assetId },
    },
    select: { id: true },
  });
  if (ambience) return true;

  // Tokens live as JSON on the map, so they cannot be matched by column. Only
  // the art URL is read, and only once everything cheaper has missed.
  const maps = await prisma.map.findMany({
    where: { campaignId: { in: campaignIds } },
    select: { tokens: true },
  });
  return maps.some((map) =>
    readTokens(map.tokens).some((token) => token?.imageUrl?.includes(assetId))
  );
}

/** The asset fields the read decision depends on. */
export interface AssetAccessFacts {
  id: string;
  scope: AssetScope;
  uploadedById: string | null;
  campaignId: string | null;
}

/**
 * Whether a user may read an asset's bytes.
 *
 * The single rule, used both by the route that serves an asset and by every
 * route that lets a user *point* at one. Those two were separate before, which
 * is how referencing a stranger's asset came to grant the right to read it:
 * only the serving side asked the question, and by then the reference already
 * existed and answered it in the affirmative.
 */
export async function canReadAsset(
  asset: AssetAccessFacts,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin) return true;

  if (asset.scope === 'USER') {
    if (asset.uploadedById === userId) return true;
    if (await assetUsedInUserCampaign(asset.id, userId, asset.uploadedById)) return true;
    return documentSharedWithUser(asset.id, userId);
  }

  if (asset.scope === 'CAMPAIGN' && asset.campaignId) {
    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId: asset.campaignId } },
    });
    if (membership?.role === 'DM') return true;
    if (membership) return !(await spiritLayerHidesAsset(asset.id, asset.campaignId, userId));
    // Scoped to one campaign, but a map in another may point at it.
    if (await assetUsedInUserCampaign(asset.id, userId, asset.uploadedById)) return true;
    return documentSharedWithUser(asset.id, userId);
  }

  // GLOBAL, or a campaign asset with no campaign recorded.
  return true;
}

/**
 * Whether a document has been shared with a campaign this user belongs to.
 *
 * A document is private to its uploader until a DM links it to a campaign, and
 * the link is the only thing that opens it to that campaign's members. Checked
 * last, after the cheaper questions, and only for the scopes where privacy is
 * in question at all.
 */
async function documentSharedWithUser(assetId: string, userId: string): Promise<boolean> {
  const link = await prisma.campaignDocument.findFirst({
    where: {
      assetId,
      campaign: { memberships: { some: { userId } } },
    },
    select: { id: true },
  });
  return link !== null;
}

/**
 * The same decision, given only an id — for routes that are about to store a
 * reference to an asset and must check the caller may use it first.
 *
 * An asset that does not exist answers false: a reference to nothing is not
 * something to write into a map either.
 */
export async function canReadAssetById(
  assetId: string,
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, scope: true, uploadedById: true, campaignId: true },
  });
  if (!asset) return false;
  return canReadAsset(asset, userId, isAdmin);
}
