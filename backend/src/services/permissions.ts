import { CampaignRole, PlatformRole, AssetType, AssetScope } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { readTokens } from '../utils/prisma-json';
import { getSpiritVisibility, getSpiritVisibilityAcrossCampaigns } from '../utils/spirit-layer';
import { extractAssetId, isExactAssetAddress, isSameOriginPath } from '../utils/asset-urls';
import { escapeLikePattern } from '../utils/likePattern';
import { sessionLetsPlayersAct } from '../utils/drawingRules';
import { picturesInSharedDocuments } from './sharedDocumentPictures';

/**
 * Permission Verification Helpers
 * Role & Permission Model
 * Server-side permission checks for business logic
 */

/**
 * Check if user is an admin
 */
function isAdmin(platformRole: PlatformRole): boolean {
  return platformRole === 'ADMIN';
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
 * cannot disagree. Asked by the three move events and the REST token update,
 * which asks it for a turn (`rotation`) too.
 */
export function canMoveTokensNow(role: string | undefined, campaignStatus: string): boolean {
  if (role === 'DM') return true;
  return sessionLetsPlayersAct(campaignStatus);
}

/** What both channels answer a player who moves during a pause. */
export const PAUSED_MOVE_REFUSAL = 'Players cannot move tokens while the session is paused or ended';

// Who may draw on a map, erase a drawing and be sent one: a file kept
// identical in the browser (utils/drawingRules.ts), so the draw tool offers
// what the handlers take.
export {
  canDraw, drawRefusal, canDrawOnLayer, canEraseDrawing, eraseRefusal, drawingSentTo,
  DRAW_REFUSAL, DRAW_LAYER_REFUSAL,
} from '../utils/drawingRules';

// The answers to a whisper this refuses, worded beside the schema that also
// gives one (validators/chat.ts).
export { WHISPER_SELF_REFUSAL, WHISPER_RECIPIENT_REFUSAL } from '../validators/chat';

/**
 * Who a member may whisper to: any current member of the campaign but
 * themselves, spectators and the DM included. The sender's own right is the
 * right to chat, which every member has. Returns the recipient's id and
 * display name, for the message sent to both, or null when they may not be
 * whispered to. The chat handler refuses a whisper to oneself before asking,
 * with its own answer; this refuses it too.
 */
export async function whisperRecipient(
  campaignId: string,
  senderId: string,
  recipientId: string
): Promise<{ id: string; displayName: string } | null> {
  if (recipientId === senderId) return null;
  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: recipientId, campaignId } },
    select: { user: { select: { id: true, displayName: true } } },
  });
  return membership?.user ?? null;
}

/**
 * May this member read this map: the DM any map of the campaign; anyone else
 * only the map the campaign is showing. A prepared map is the DM's until they
 * switch to it, with its artwork, walls, lights and whatever tokens were left
 * visible on it. One rule for the map routes, the walls, lights, fog and
 * exploration requests, the campaign fetch's map list, and the asset reads a
 * map's use grants.
 */
export function canReadMap(
  role: string | undefined,
  mapId: string,
  currentMapId: string | null | undefined
): boolean {
  if (role === 'DM') return true;
  return !!currentMapId && mapId === currentMapId;
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
  platformRole: PlatformRole,
  db: Prisma.TransactionClient = prisma
): Promise<boolean> {
  if (isAdmin(platformRole)) {
    return true;
  }

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { ownerId: true },
  });

  if (!campaign) {
    return false;
  }

  if (campaign.ownerId === userId) {
    return true;
  }

  const membership = await db.campaignMembership.findUnique({
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
 * The answer also carries the campaign the asset may be filed under, because
 * `campaignId` is what decides which campaign lists an asset and a caller's own
 * value cannot be trusted for that. Only a CAMPAIGN-scoped asset has one.
 */
type ScopeDecision =
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

/** A map's picture addresses: all the map-picture rule reads of a map. */
const MAP_PICTURES_SELECT = {
  id: true, imageUrl: true, baseLayerUrl: true, spiritLayerUrl: true,
} as const satisfies Prisma.MapSelect;
type MapPictures = Prisma.MapGetPayload<{ select: typeof MAP_PICTURES_SELECT }>;

/** What the map-picture rule knows of one campaign, for one member who is not its DM. */
export interface CampaignMapPictures {
  /** Every asset a map of the campaign names as its picture, base layer or spirit layer. */
  named: ReadonlySet<string>;
  /** Those the current map shows this member: its picture and base layer, and its spirit layer if they see that plane. */
  shown: ReadonlySet<string>;
  /** Pictures a document shared with the campaign embeds: the DM chose to show them to its members. */
  inSharedDocuments: ReadonlySet<string>;
  /**
   * Pictures a map at another of the member's tables shows them (picturesAtTables),
   * each with everyone who sits at a table showing it.
   */
  atOtherTables: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The asset ids a map names as its picture, base layer and spirit layer. */
function picturesNamedBy(map: MapPictures): string[] {
  return [map.imageUrl, map.baseLayerUrl, map.spiritLayerUrl].flatMap((address) => extractAssetId(address) ?? []);
}

/**
 * The asset ids a map shows a member while a table they sit at is on it:
 * its picture and base layer, and its spirit layer if they see that plane.
 * What a table shows, written once for a member's own table
 * (campaignMapPictures) and their others (picturesOnTables), so a new
 * picture of a map cannot show at one and stay hidden at the other.
 */
function picturesShownBy(map: MapPictures, seesSpiritPlane: boolean): string[] {
  return [map.imageUrl, map.baseLayerUrl, seesSpiritPlane ? map.spiritLayerUrl : null].flatMap((address) => extractAssetId(address) ?? []);
}

/**
 * The pictures of a campaign's maps as one member who is not its DM sees
 * them. `maps` may be every map of the campaign or only those naming the
 * assets in question: a map that names none of them changes no answer.
 * Addresses are read with extractAssetId, the reader the write routes check
 * an address with before storing it.
 */
export function campaignMapPictures(
  maps: readonly MapPictures[],
  currentMapId: string | null,
  seesSpiritPlane: boolean
): Pick<CampaignMapPictures, 'named' | 'shown'> {
  const named = new Set<string>();
  const shown = new Set<string>();
  for (const map of maps) {
    for (const id of picturesNamedBy(map)) named.add(id);
    if (map.id !== currentMapId) continue;
    for (const id of picturesShownBy(map, seesSpiritPlane)) shown.add(id);
  }
  return { named, shown };
}

/**
 * Whether a campaign asset is kept from a member of that campaign who is not
 * its DM: a player or a spectator. A map's picture, base layer or spirit
 * layer, and a map picture no map uses yet, is theirs to see only while a
 * table they sit at is on a map that shows it to them, and anything they
 * uploaded themselves always. Token art and every other asset are left alone.
 *
 * "A table they sit at" is the picture's own campaign's, and any other of
 * theirs whose current map shows it, while the picture's uploader sits there
 * too: as for a member of that campaign alone (assetUsedInUserCampaign), the
 * uploader's presence is what keeps a campaign of one's own from opening
 * someone else's picture. A picture embedded in a document shared with the
 * picture's campaign shows to its members as well, as the handout does.
 *
 * The one rule for the asset list and for reading an asset, so a member is
 * listed a picture exactly when it opens for them. Final for a member:
 * nothing else they can point at opens it, since a player could set their
 * character's picture to a map's while the table was there and keep it after
 * the table left. Only maps, which the DM alone sets, and the DM's shared
 * documents count.
 */
export function mapPictureHidden(
  asset: Pick<AssetAccessFacts, 'id' | 'type' | 'uploadedById'>,
  viewerId: string,
  pictures: CampaignMapPictures
): boolean {
  if (asset.uploadedById === viewerId) return false;
  if (pictures.shown.has(asset.id) || pictures.inSharedDocuments.has(asset.id)) return false;
  if (asset.uploadedById !== null && pictures.atOtherTables.get(asset.id)?.has(asset.uploadedById)) return false;
  return asset.type === 'MAP' || pictures.named.has(asset.id);
}

/** The facts read of a user's tables: their campaigns, each one's current map and which spirit planes they see. */
interface Tables {
  memberships: ReadonlyArray<{ campaignId: string; role: CampaignRole }>;
  currentMapOf: ReadonlyMap<string, string | null>;
  maps: ReadonlyArray<MapPictures & { campaignId: string }>;
  seesSpirit: ReadonlyMap<string, boolean>;
}

/**
 * For each picture a table the user sits at is on, the campaigns whose
 * table it is: the current map of each of their campaigns, the ones they
 * run included, with its spirit layer only where they see that plane (a DM
 * always does). A map a table is not on counts for nothing, so a picture is
 * not kept by putting it on a map of one's own.
 */
function picturesOnTables(tables: Tables): Map<string, Set<string>> {
  const runs = new Set(tables.memberships.filter((m) => m.role === 'DM').map((m) => m.campaignId));
  const showing = new Map<string, Set<string>>();
  for (const map of tables.maps) {
    if (tables.currentMapOf.get(map.campaignId) !== map.id) continue;
    const spiritShown = runs.has(map.campaignId) || tables.seesSpirit.get(map.campaignId) === true;
    for (const id of picturesShownBy(map, spiritShown)) {
      const campaigns = showing.get(id) ?? new Set<string>();
      campaigns.add(map.campaignId);
      showing.set(id, campaigns);
    }
  }
  return showing;
}

/** picturesOnTables, with each picture's campaigns turned into everyone who sits at them. */
async function picturesAtTables(tables: Tables): Promise<Map<string, Set<string>>> {
  const showing = picturesOnTables(tables);
  const campaignIds = [...new Set([...showing.values()].flatMap((c) => [...c]))];
  const seated = campaignIds.length === 0
    ? []
    : await prisma.campaignMembership.findMany({ where: { campaignId: { in: campaignIds } }, select: { campaignId: true, userId: true } });
  const membersOf = new Map<string, Set<string>>();
  for (const seat of seated) membersOf.set(seat.campaignId, (membersOf.get(seat.campaignId) ?? new Set<string>()).add(seat.userId));
  const result = new Map<string, Set<string>>();
  for (const [assetId, campaigns] of showing) {
    result.set(assetId, new Set([...campaigns].flatMap((c) => [...(membersOf.get(c) ?? [])])));
  }
  return result;
}

/**
 * A user's tables: their campaigns and each one's current map, or only a
 * current map naming `onlyAssetId`, with the spirit planes they see. Only a
 * current map shows anything at a table (picturesOnTables), so a campaign of
 * many maps costs one. The spirit planes are read only where a map is read.
 */
async function tablesOf(userId: string, onlyAssetId?: string): Promise<Tables> {
  const memberships = await prisma.campaignMembership.findMany({ where: { userId }, select: { campaignId: true, role: true } });
  const campaignIds = memberships.map((m) => m.campaignId);
  if (campaignIds.length === 0) return { memberships, currentMapOf: new Map(), maps: [], seesSpirit: new Map() };
  const naming: Prisma.MapWhereInput = onlyAssetId === undefined ? {} : {
    OR: [
      { imageUrl: { contains: onlyAssetId } },
      { baseLayerUrl: { contains: onlyAssetId } },
      { spiritLayerUrl: { contains: onlyAssetId } },
    ],
  };
  const campaigns = await prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, currentMapId: true } });
  const currentIds = campaigns.flatMap((c) => (c.currentMapId ? [c.currentMapId] : []));
  const maps = currentIds.length === 0 ? [] : await prisma.map.findMany({
    where: { AND: [{ id: { in: currentIds } }, { campaignId: { in: campaignIds } }, naming] },
    select: { ...MAP_PICTURES_SELECT, campaignId: true },
  });
  const withMaps = [...new Set(maps.map((m) => m.campaignId))];
  const seesSpirit = withMaps.length === 0 ? new Map<string, boolean>() : await getSpiritVisibilityAcrossCampaigns(userId, withMaps);
  return { memberships, currentMapOf: new Map(campaigns.map((c) => [c.id, c.currentMapId])), maps, seesSpirit };
}

/**
 * The maps of these campaigns whose picture, base layer or spirit layer
 * mentions one of the campaign's own files that is not a map picture, read
 * in the database. The map-picture rule keeps a map picture by its type, so
 * of a campaign's other maps only these change what it keeps
 * (campaignMapPictures reads each address exactly).
 */
async function mapsNamingOtherFiles(campaignIds: string[]): Promise<Array<MapPictures & { campaignId: string }>> {
  if (campaignIds.length === 0) return [];
  return prisma.$queryRaw<Array<MapPictures & { campaignId: string }>>`
    SELECT DISTINCT m.id, m."imageUrl", m."baseLayerUrl", m."spiritLayerUrl", m."campaignId"
    FROM "Map" m
    JOIN "Asset" a ON a."campaignId" = m."campaignId"
    WHERE m."campaignId" IN (${Prisma.join(campaignIds)})
      AND a.scope = 'CAMPAIGN' AND a.type <> 'MAP'
      AND (strpos(m."imageUrl", a.id) > 0
        OR strpos(coalesce(m."baseLayerUrl", ''), a.id) > 0
        OR strpos(coalesce(m."spiritLayerUrl", ''), a.id) > 0)
  `;
}

/**
 * The campaign assets the map-picture rule keeps from this user in the given
 * campaigns, all of them ones where the user is a member who is not the DM.
 * Returns asset ids, for a listing to leave out. In a fixed number of
 * queries however many campaigns: worked out one campaign at a time, a
 * player in many made the asset list run hundreds.
 */
export async function mapPictureAssetIdsHiddenFrom(userId: string, campaignIds: string[]): Promise<string[]> {
  const ids = [...new Set(campaignIds)];
  if (ids.length === 0) return [];
  const [tables, namingOthers] = await Promise.all([tablesOf(userId), mapsNamingOtherFiles(ids)]);
  const own = new Map(ids.map((campaignId) => [campaignId, campaignMapPictures(
    [...tables.maps, ...namingOthers].filter((m) => m.campaignId === campaignId),
    tables.currentMapOf.get(campaignId) ?? null,
    tables.seesSpirit.get(campaignId) === true
  )]));
  const named = [...new Set([...own.values()].flatMap((p) => [...p.named]))];
  const candidates = await prisma.asset.findMany({
    where: { scope: 'CAMPAIGN', campaignId: { in: ids }, OR: [{ type: 'MAP' }, { id: { in: named } }] },
    select: { id: true, type: true, uploadedById: true, campaignId: true },
  });
  // The shared documents are asked about the candidates alone.
  const [atOtherTables, documents] = await Promise.all([
    picturesAtTables(tables),
    picturesInSharedDocuments(ids, new Set(candidates.map((a) => a.id))),
  ]);
  const picturesIn = new Map([...own].map(([campaignId, pictures]): [string, CampaignMapPictures] => [campaignId, {
    ...pictures,
    inSharedDocuments: documents.get(campaignId) ?? new Set(),
    atOtherTables,
  }]));
  return candidates
    .filter((asset) => {
      const pictures = asset.campaignId ? picturesIn.get(asset.campaignId) : undefined;
      return pictures !== undefined && mapPictureHidden(asset, userId, pictures);
    })
    .map((asset) => asset.id);
}

/**
 * The same rule for one asset of `campaignId`, read by a member who is not
 * its DM. One query when no map names the asset (token art, a picture not
 * yet on a map) and the rule shows it; the user's other tables and the
 * campaign's shared documents are read only for a picture the campaign's own
 * table keeps from them.
 */
async function mapPictureHiddenInCampaign(
  asset: Pick<AssetAccessFacts, 'id' | 'type' | 'uploadedById'>,
  campaignId: string,
  userId: string
): Promise<boolean> {
  // Narrowed by the database to the maps whose addresses mention the id;
  // campaignMapPictures then reads each address exactly.
  const maps = await prisma.map.findMany({
    where: {
      campaignId,
      OR: [
        { imageUrl: { contains: asset.id } },
        { baseLayerUrl: { contains: asset.id } },
        { spiritLayerUrl: { contains: asset.id } },
      ],
    },
    select: MAP_PICTURES_SELECT,
  });
  let currentMapId: string | null = null;
  let seesSpiritPlane = false;
  if (maps.length > 0) {
    currentMapId = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } }))?.currentMapId ?? null;
    if (maps.some((m) => m.id === currentMapId && m.spiritLayerUrl)) {
      seesSpiritPlane = await getSpiritVisibility(campaignId, userId);
    }
  }
  const own = campaignMapPictures(maps, currentMapId, seesSpiritPlane);
  if (!mapPictureHidden(asset, userId, { ...own, inSharedDocuments: new Set(), atOtherTables: new Map() })) return false;
  const [documents, atOtherTables] = await Promise.all([
    picturesInSharedDocuments([campaignId], new Set([asset.id])),
    tablesOf(userId, asset.id).then(picturesAtTables),
  ]);
  return mapPictureHidden(asset, userId, { ...own, inSharedDocuments: documents.get(campaignId) ?? new Set(), atOtherTables });
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
 * A stored address counts only when it names this asset: it is read with
 * extractAssetId, the reader the write routes check an address with before
 * storing it, and the id it gives must equal `assetId`. Where a query below
 * matches the id as a substring, that only narrows the rows it reads.
 */
async function assetUsedInUserCampaign(
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
    prisma.campaignMembership.findMany({ where: { userId }, select: { campaignId: true, role: true } }),
    prisma.campaignMembership.findMany({ where: { userId: uploaderId }, select: { campaignId: true } }),
  ]);

  const uploaderCampaigns = new Set(uploaderIn.map((m) => m.campaignId));
  const shared = viewerIn.filter((m) => uploaderCampaigns.has(m.campaignId));
  const campaignIds = shared.map((m) => m.campaignId);

  if (campaignIds.length === 0) return false;

  // A map's use counts for a player only while the campaign is showing that
  // map (canReadMap): a prepared map is the DM's until they switch to it,
  // artwork and token art included. The DM's campaigns count every map.
  const dmCampaignIds = shared.filter((m) => m.role === 'DM').map((m) => m.campaignId);
  const memberCampaignIds = shared.filter((m) => m.role !== 'DM').map((m) => m.campaignId);
  const currentMapIds = memberCampaignIds.length === 0
    ? []
    : (await prisma.campaign.findMany({ where: { id: { in: memberCampaignIds } }, select: { currentMapId: true } }))
        .map((c) => c.currentMapId)
        .filter((id): id is string => id !== null);
  const readableMaps: Prisma.MapWhereInput = {
    OR: [{ campaignId: { in: dmCampaignIds } }, { id: { in: currentMapIds } }],
  };

  // A map's own layers first: that is the common case, and it answers without
  // reading any JSON. The spirit layer counts only where the viewer may see
  // that plane; the map keeps it from everyone else, and so does this.
  // Every address below is matched on the asset it names, read by the same
  // extractAssetId the write routes check before storing one. The database
  // search only narrows the rows: an address that merely contains the id
  // (the id with a character after it, inside a longer segment, under
  // another directory, after a different asset) names no asset, or another,
  // to the write check, so it must grant nothing here either.
  const names = (address: string | null | undefined): boolean => extractAssetId(address) === assetId;

  const mapLayers = await prisma.map.findMany({
    where: {
      AND: [readableMaps, { OR: [{ imageUrl: { contains: assetId } }, { baseLayerUrl: { contains: assetId } }] }],
    },
    select: { imageUrl: true, baseLayerUrl: true },
  });
  if (mapLayers.some((m) => names(m.imageUrl) || names(m.baseLayerUrl))) return true;
  const spiritLayers = await prisma.map.findMany({
    where: { AND: [readableMaps, { spiritLayerUrl: { contains: assetId } }] },
    select: { campaignId: true, spiritLayerUrl: true },
  });
  for (const map of new Set(spiritLayers.filter((m) => names(m.spiritLayerUrl)).map((m) => m.campaignId))) {
    if (await getSpiritVisibility(map, userId)) return true;
  }

  const [characters, creatures, tokenTemplates] = await Promise.all([
    prisma.character.findMany({
      where: { campaignId: { in: campaignIds }, tokenImageUrl: { contains: assetId } },
      select: { tokenImageUrl: true },
    }),
    prisma.creatureTemplate.findMany({
      where: { campaignId: { in: campaignIds }, imageUrl: { contains: assetId } },
      select: { imageUrl: true },
    }),
    prisma.tokenTemplate.findMany({
      where: { campaignId: { in: campaignIds }, imageUrl: { contains: assetId } },
      select: { imageUrl: true },
    }),
  ]);
  if (
    characters.some((c) => names(c.tokenImageUrl)) ||
    creatures.some((c) => names(c.imageUrl)) ||
    tokenTemplates.some((t) => names(t.imageUrl))
  ) {
    return true;
  }

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

  // Tokens live as JSON on the map, so they cannot be matched by column, and
  // this runs only once everything cheaper has missed. The database narrows
  // to the readable maps whose tokens mention the id at all, as the column
  // searches above do; only those maps' tokens are read, and each token's art
  // address is checked as above. Loading every readable map's tokens made
  // each request for an asset the campaign does not use read all of them.
  const mentioning = await prisma.$queryRaw<Array<{ tokens: unknown }>>`
    SELECT tokens FROM "Map"
    WHERE ("campaignId" = ANY(${dmCampaignIds}::text[]) OR id = ANY(${currentMapIds}::text[]))
      AND tokens::text LIKE ${`%${escapeLikePattern(assetId)}%`}`;
  return mentioning.some((map) =>
    readTokens(map.tokens as Prisma.JsonValue).some((token) => names(token?.imageUrl))
  );
}

/** The asset fields the read decision depends on. */
export interface AssetAccessFacts {
  id: string;
  type: AssetType;
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

  // A campaign asset with no campaign recorded is read as a personal one. The
  // foreign key nulls the campaign when one is deleted; the delete route turns
  // its assets personal first, and this keeps any other way of removing a
  // campaign from opening its assets to everyone.
  if (asset.scope === 'USER' || (asset.scope === 'CAMPAIGN' && !asset.campaignId)) {
    if (asset.uploadedById === userId) return true;
    if (await assetUsedInUserCampaign(asset.id, userId, asset.uploadedById)) return true;
    return documentSharedWithUser(asset.id, userId);
  }

  if (asset.scope === 'CAMPAIGN' && asset.campaignId) {
    const membership = await prisma.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId: asset.campaignId } },
    });
    if (membership?.role === 'DM') return true;
    if (membership) return !(await mapPictureHiddenInCampaign(asset, asset.campaignId, userId));
    // Scoped to one campaign, but a map in another may point at it.
    if (await assetUsedInUserCampaign(asset.id, userId, asset.uploadedById)) return true;
    return documentSharedWithUser(asset.id, userId);
  }

  // GLOBAL.
  return true;
}

/**
 * Whether a user may change an asset where it is: rewrite a document's text,
 * and, narrowed by mayRemoveAsset (services/assetRemoval.ts) for a campaign
 * asset's uploader who does not run the campaign, delete it or move it out
 * of its scope. The delete and move routes ask mayRemoveAsset alike, so a
 * right one takes away cannot be kept through the other.
 *
 * - GLOBAL: an admin, or its uploader while they still manage global assets.
 * - USER: its uploader, or an admin.
 * - CAMPAIGN: its uploader while still a member, the campaign's DM, or an
 *   admin. A campaign asset stays with the campaign once its uploader leaves.
 *   One with no campaign recorded is an admin's alone.
 *
 * `known` is what the rule reads about the user, read once beforehand
 * (assetChangeFactsFor) when it is asked of a whole list; without it the
 * rule reads what it needs.
 */
export async function mayChangeAsset(
  asset: Pick<AssetAccessFacts, 'scope' | 'uploadedById' | 'campaignId'>,
  userId: string,
  isAdmin: boolean,
  known?: AssetChangeFacts
): Promise<boolean> {
  if (isAdmin) return true;
  const isOwner = asset.uploadedById === userId;

  if (asset.scope === 'GLOBAL') {
    if (!isOwner) return false;
    if (known) return known.globalAssetManager;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { globalAssetManager: true } });
    return user?.globalAssetManager === true;
  }

  if (asset.scope === 'USER') return isOwner;

  if (!asset.campaignId) return false;
  const role = known
    ? (known.roles.get(asset.campaignId) ?? null)
    : ((await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId: asset.campaignId } },
        select: { role: true },
      }))?.role ?? null);
  return (isOwner && role !== null) || role === 'DM';
}

/** What mayChangeAsset reads about a user: whether they manage global assets, and their role in each campaign. */
interface AssetChangeFacts {
  globalAssetManager: boolean;
  roles: ReadonlyMap<string, CampaignRole>;
}

/** A user's AssetChangeFacts, in two reads, for asking mayChangeAsset of many assets. */
export async function assetChangeFactsFor(userId: string): Promise<AssetChangeFacts> {
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { globalAssetManager: true } }),
    prisma.campaignMembership.findMany({ where: { userId }, select: { campaignId: true, role: true } }),
  ]);
  return {
    globalAssetManager: user?.globalAssetManager === true,
    roles: new Map(memberships.map((m) => [m.campaignId, m.role])),
  };
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
    select: { id: true, type: true, scope: true, uploadedById: true, campaignId: true },
  });
  if (!asset) return false;
  return canReadAsset(asset, userId, isAdmin);
}

/**
 * May this user store this address as a reference to an asset: a map's
 * image or spirit layer, a token's art, a template's or a character's
 * picture. The read rule counts any stored reference as the campaign using
 * the asset, so storing one without this check is what let a member read an
 * asset of someone else's by naming it.
 *
 * Pass the address exactly as it will be stored, since normalising can turn
 * an address that names no asset into one that does. An address that names
 * no asset, or none, is fine, and so is one naming an asset that does not
 * exist: it grants nothing, and a picture deleted since a template or a token
 * was made would otherwise refuse every copy of it. So is the address already
 * stored on the record being updated (`stored`): refusing it would refuse
 * every unrelated edit of a record whose picture has since become unreadable,
 * and keeping it grants nothing it did not already.
 */
export async function canReferenceAsset(
  address: string | null | undefined,
  userId: string,
  stored?: string | null,
  campaignId?: string
): Promise<boolean> {
  if (!address) return true;
  if (stored !== undefined && address === stored) return true;
  // One reading of an address for every reader: an address on this server
  // that is not an asset's exact address was accepted here as naming no
  // asset, and the exports, reading it their own way, found one in it.
  if (isSameOriginPath(address) && !isExactAssetAddress(address)) return false;
  const assetId = extractAssetId(address);
  if (!assetId) return true;
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, type: true, scope: true, uploadedById: true, campaignId: true },
  });
  if (!asset) return true;
  // Never as an administrator: an admin may read any file, but a stored
  // reference opens the asset to everyone at the table, as setting a scene's
  // music does (handlers/atmosphere.ts).
  if (await canReadAsset(asset, userId, false)) return true;
  // A copy of something already in this campaign (Duplicate, Save as
  // Template, placing from a template) names a picture stored here already.
  // The read grant turns on a reference existing in the campaign, so another
  // one here grants no one anything, even when the picture can no longer be
  // read (its uploader has left).
  return campaignId !== undefined && (await addressUsedInCampaign(address, campaignId));
}

/**
 * May this address be stored as a map's picture or spirit layer, as far as
 * the kind of asset goes: only an asset uploaded as a map picture. Create
 * Map and Edit Map offer nothing else, and a Universal VTT import stores its
 * picture as one. Asked after canReferenceAsset, which decides whether the
 * caller may use the asset at all.
 *
 * An address names its asset by id whatever folder it gives, and a bare id
 * is given the maps folder, so the asset's own type is read. The address
 * already stored on the map (`stored`) is taken back as it is, so a map made
 * before this rule keeps its picture through every edit that leaves it
 * alone. An address naming no asset, or one that does not exist, is left to
 * canReferenceAsset, as it shows nothing and grants nothing.
 */
export async function isMapPicture(address: string | null | undefined, stored?: string | null): Promise<boolean> {
  return namesPictureOfType(address, 'MAP', stored);
}

/**
 * May this address be stored as a token's picture, as far as the kind of
 * asset goes: only an asset uploaded as a token picture. That is a token's
 * own, a token template's, a creature's, a character's and a character
 * template's, since each becomes a token's picture on the map. The token
 * pickers and the sheet editors offer nothing else, and a map picture may
 * hold far more pixels than a token picture may. The rest is as for
 * isMapPicture.
 */
export async function isTokenPicture(address: string | null | undefined, stored?: string | null): Promise<boolean> {
  return namesPictureOfType(address, 'TOKEN', stored);
}

/** The rule isMapPicture and isTokenPicture share, for the one type each takes. */
async function namesPictureOfType(address: string | null | undefined, type: AssetType, stored?: string | null): Promise<boolean> {
  if (!address) return true;
  if (stored !== undefined && address === stored) return true;
  const assetId = extractAssetId(address);
  if (!assetId) return true;
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { type: true } });
  return !asset || asset.type === type;
}

/** Whether a record of the campaign already stores exactly this picture address. */
async function addressUsedInCampaign(address: string, campaignId: string): Promise<boolean> {
  const [templates, creatures, characters] = await Promise.all([
    prisma.tokenTemplate.count({ where: { campaignId, imageUrl: address } }),
    prisma.creatureTemplate.count({ where: { campaignId, imageUrl: address } }),
    prisma.character.count({ where: { campaignId, tokenImageUrl: address } }),
  ]);
  if (templates + creatures + characters > 0) return true;
  const maps = await prisma.map.findMany({
    where: { campaignId },
    select: { imageUrl: true, baseLayerUrl: true, spiritLayerUrl: true, tokens: true },
  });
  return maps.some((m) =>
    m.imageUrl === address || m.baseLayerUrl === address || m.spiritLayerUrl === address
    || readTokens(m.tokens).some((t) => t.imageUrl === address)
  );
}
