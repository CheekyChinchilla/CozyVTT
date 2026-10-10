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

export type AssetUseKind =
  | 'map'
  | 'token'
  | 'character'
  | 'characterTemplate'
  | 'creature'
  | 'tokenTemplate'
  | 'campaignSetting';

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
interface FoundUse extends AssetUse {
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

/** Every record that stores an address naming `assetId`. */
async function findUses(assetId: string): Promise<FoundUse[]> {
  const names = (address: string | null | undefined): boolean => extractAssetId(address) === assetId;
  const mentions = { contains: assetId };

  const [maps, mapsWithTokens, characters, characterTemplates, creatures, tokenTemplates, campaigns] =
    await Promise.all([
      prisma.map.findMany({
        where: { OR: [{ imageUrl: mentions }, { baseLayerUrl: mentions }, { spiritLayerUrl: mentions }] },
        select: {
          id: true, name: true, campaignId: true, imageUrl: true, baseLayerUrl: true, spiritLayerUrl: true,
          campaign: { select: { name: true } },
        },
      }),
      // Tokens are JSON on the map, so the search is on the column read as text.
      // The id is a UUID read from the asset row, and is bound as a parameter.
      prisma.$queryRaw<MapTokenRow[]>`
        SELECT m.id, m.name, m."campaignId", c.name AS "campaignName", m.tokens
        FROM "Map" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        WHERE m.tokens::text LIKE ${`%${assetId}%`}
      `,
      prisma.character.findMany({
        where: { tokenImageUrl: mentions },
        select: { name: true, userId: true, campaignId: true, tokenImageUrl: true, campaign: { select: { name: true } } },
      }),
      prisma.characterTemplate.findMany({
        where: { tokenImageUrl: mentions },
        select: { name: true, tokenImageUrl: true },
      }),
      prisma.creatureTemplate.findMany({
        where: { imageUrl: mentions },
        select: { name: true, campaignId: true, imageUrl: true, campaign: { select: { name: true } } },
      }),
      prisma.tokenTemplate.findMany({
        where: { imageUrl: mentions },
        select: { name: true, campaignId: true, imageUrl: true, campaign: { select: { name: true } } },
      }),
      // The track a campaign is playing, inside its vibe settings.
      prisma.campaign.findMany({
        where: { vibeSettings: { path: ['atmosphereAudio', 'assetId'], equals: assetId } },
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
    const track = readJsonObject(c.vibeSettings)?.atmosphereAudio;
    const trackId = track && typeof track === 'object' ? (track as Record<string, unknown>).assetId : undefined;
    if (trackId === assetId) {
      found({ kind: 'campaignSetting', name: c.name, campaignId: c.id, campaignName: c.name });
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
