// ============================================
// Where an asset is used
// ============================================
//
// An asset is a row and a file. Everything that shows it holds the address as
// plain text, and nothing tells those records when the asset is deleted, so a
// deleted map image or token picture is a blank on every map and sheet that
// named it. This reads the places an address can be stored so the delete route
// can say what would go blank before it happens.
//
// An address counts only when it names this asset, read the way the write
// routes read one (extractAssetId). The database search narrows the rows to
// those containing the id; an address that merely contains it, such as a
// longer id or a query string, names no asset here and is not listed.

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { extractAssetId } from '../utils/asset-urls';
import { readJsonObject, readTokens } from '../utils/prisma-json';
import { vibePeriodAudioAssetId } from '../utils/vibeAudio';

export type AssetUseKind =
  | 'map'
  | 'token'
  | 'character'
  | 'characterTemplate'
  | 'creature'
  | 'tokenTemplate'
  | 'campaignSetting'
  | 'vibePeriod';

/**
 * One thing that uses an asset. `name` and the campaign are null when the
 * caller may not see them; `count` is how many such things were merged into
 * the entry (a map's tokens, or the redacted ones of one kind).
 */
export interface AssetUse {
  kind: AssetUseKind;
  name: string | null;
  campaignId: string | null;
  campaignName: string | null;
  count: number;
}

/** A use before the caller's view of it is decided: who owns it, as well as what it is. */
export interface FoundUse extends AssetUse {
  /** The user who owns the record, for the ones a player owns (a character). */
  ownerId: string | null;
  /** Visible to every signed-in user, as a shared character template is. */
  public: boolean;
}

/** The most entries a refusal lists. Past this, the rest are only counted. */
export const MAX_LISTED_USES = 100;

interface MapTokenRow {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  tokens: Prisma.JsonValue;
}

/**
 * Every record that stores an address naming `assetId`, read through `db`
 * (a transaction's client, when the caller decides inside one), with who owns
 * each: for what a caller is shown (assetUsageFor), and for what becomes of a
 * deleted account's personal file (services/accountDeletion).
 */
export async function findUses(assetId: string, db: Prisma.TransactionClient = prisma): Promise<FoundUse[]> {
  const names = (address: string | null | undefined): boolean => extractAssetId(address) === assetId;
  const mentions = { contains: assetId };

  const [maps, mapsWithTokens, characters, characterTemplates, creatures, tokenTemplates, campaigns] =
    await Promise.all([
      db.map.findMany({
        where: { OR: [{ imageUrl: mentions }, { baseLayerUrl: mentions }, { spiritLayerUrl: mentions }] },
        select: {
          id: true, name: true, campaignId: true, imageUrl: true, baseLayerUrl: true, spiritLayerUrl: true,
          campaign: { select: { name: true } },
        },
      }),
      // Tokens are JSON on the map, so the search is on the column read as text.
      // The id is a UUID read from the asset row, and is bound as a parameter.
      db.$queryRaw<MapTokenRow[]>`
        SELECT m.id, m.name, m."campaignId", c.name AS "campaignName", m.tokens
        FROM "Map" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        WHERE m.tokens::text LIKE ${`%${assetId}%`}
      `,
      db.character.findMany({
        where: { tokenImageUrl: mentions },
        select: { name: true, userId: true, campaignId: true, tokenImageUrl: true, campaign: { select: { name: true } } },
      }),
      db.characterTemplate.findMany({
        where: { tokenImageUrl: mentions },
        select: { name: true, tokenImageUrl: true },
      }),
      db.creatureTemplate.findMany({
        where: { imageUrl: mentions },
        select: { name: true, campaignId: true, imageUrl: true, campaign: { select: { name: true } } },
      }),
      db.tokenTemplate.findMany({
        where: { imageUrl: mentions },
        select: { name: true, campaignId: true, imageUrl: true, campaign: { select: { name: true } } },
      }),
      // The track a campaign is playing, and the tracks its time-of-day
      // periods play when the DM switches to them, inside its vibe settings.
      db.campaign.findMany({
        where: {
          OR: [
            { vibeSettings: { path: ['atmosphereAudio', 'assetId'], equals: assetId } },
            { vibeSettings: { path: ['periods'], array_contains: [{ audio: assetId }] } },
          ],
        },
        select: { id: true, name: true, vibeSettings: true },
      }),
    ]);

  const uses: FoundUse[] = [];
  const found = (use: Omit<FoundUse, 'count' | 'ownerId' | 'public'> & Partial<Pick<FoundUse, 'ownerId' | 'public'>>) =>
    uses.push({ count: 1, ownerId: null, public: false, ...use });

  for (const m of maps) {
    if (names(m.imageUrl) || names(m.baseLayerUrl) || names(m.spiritLayerUrl)) {
      found({ kind: 'map', name: m.name, campaignId: m.campaignId, campaignName: m.campaign.name });
    }
  }

  for (const m of mapsWithTokens) {
    const count = readTokens(m.tokens).filter((t) => names(t?.imageUrl)).length;
    if (count > 0) {
      uses.push({
        kind: 'token', name: m.name, campaignId: m.campaignId, campaignName: m.campaignName,
        count, ownerId: null, public: false,
      });
    }
  }

  for (const c of characters) {
    if (names(c.tokenImageUrl)) {
      found({
        kind: 'character', name: c.name, campaignId: c.campaignId, campaignName: c.campaign?.name ?? null,
        ownerId: c.userId,
      });
    }
  }

  // Every template is browsable by every signed-in user, so its name is no secret.
  for (const t of characterTemplates) {
    if (names(t.tokenImageUrl)) {
      found({ kind: 'characterTemplate', name: t.name, campaignId: null, campaignName: null, public: true });
    }
  }

  for (const c of creatures) {
    if (names(c.imageUrl)) {
      found({ kind: 'creature', name: c.name, campaignId: c.campaignId, campaignName: c.campaign?.name ?? null });
    }
  }

  for (const t of tokenTemplates) {
    if (names(t.imageUrl)) {
      found({ kind: 'tokenTemplate', name: t.name, campaignId: t.campaignId, campaignName: t.campaign.name });
    }
  }

  for (const c of campaigns) {
    const vibe = readJsonObject(c.vibeSettings);
    const track = vibe?.atmosphereAudio;
    const trackId = track && typeof track === 'object' ? (track as Record<string, unknown>).assetId : undefined;
    if (trackId === assetId) {
      found({ kind: 'campaignSetting', name: c.name, campaignId: c.id, campaignName: c.name });
    }
    // A period's sound counts only as the vibe switch reads it.
    for (const period of Array.isArray(vibe?.periods) ? vibe.periods : []) {
      if (!period || typeof period !== 'object' || Array.isArray(period)) continue;
      const { name, audio } = period as Record<string, unknown>;
      if (vibePeriodAudioAssetId(audio) === assetId) {
        found({ kind: 'vibePeriod', name: typeof name === 'string' ? name : null, campaignId: c.id, campaignName: c.name });
      }
    }
  }

  return uses;
}

/** What a caller is shown of the uses of an asset. */
export interface AssetUsageView {
  usage: AssetUse[];
  /** Entries past the listing cap, not shown. */
  omitted: number;
}

/**
 * The places an asset is used, as the caller may see them.
 *
 * An admin sees everything. Anyone else sees a record's name and campaign only
 * where they run the campaign it belongs to, own the character, or it is a
 * shared template; the rest are folded into one nameless entry per kind, so the
 * list says what would go blank without reading other people's campaigns.
 */
export async function assetUsageFor(
  assetId: string,
  viewer: { userId: string; isAdmin: boolean }
): Promise<AssetUsageView> {
  const uses = await findUses(assetId);
  if (uses.length === 0) return { usage: [], omitted: 0 };

  let runs = new Set<string>();
  if (!viewer.isAdmin) {
    const dmOf = await prisma.campaignMembership.findMany({
      where: { userId: viewer.userId, role: 'DM' },
      select: { campaignId: true },
    });
    runs = new Set(dmOf.map((m) => m.campaignId));
  }

  const visible: AssetUse[] = [];
  const hidden = new Map<AssetUseKind, number>();
  for (const use of uses) {
    const mayName =
      viewer.isAdmin ||
      use.public ||
      use.ownerId === viewer.userId ||
      (use.campaignId !== null && runs.has(use.campaignId));
    if (mayName) {
      visible.push({
        kind: use.kind, name: use.name, campaignId: use.campaignId, campaignName: use.campaignName, count: use.count,
      });
    } else {
      hidden.set(use.kind, (hidden.get(use.kind) ?? 0) + use.count);
    }
  }

  const folded: AssetUse[] = [...hidden].map(([kind, count]) => ({
    kind, name: null, campaignId: null, campaignName: null, count,
  }));

  const all = [...visible, ...folded];
  return { usage: all.slice(0, MAX_LISTED_USES), omitted: Math.max(0, all.length - MAX_LISTED_USES) };
}

/** Whether anything stores an address naming the asset: the places `assetUsageFor` lists. */
export async function isAssetInUse(assetId: string): Promise<boolean> {
  return (await findUses(assetId)).length > 0;
}
