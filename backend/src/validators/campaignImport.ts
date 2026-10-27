/**
 * Campaign Import Zod Validation Schemas
 * Strict schemas for every JSON file inside a .cozyvtt archive.
 * All unknown/extra fields are stripped (.strip() mode).
 */

import { z } from 'zod';
import { GameSystem } from '@prisma/client';
import { ImportVibeSettingsSchema } from './campaigns';
import { SPIRIT_STYLE_PATTERN } from '../utils/styleAllowlists';
import { NpcStatBlockSchema } from './statBlock';
import { TokenHpSchema, TokenSightRadiusSchema, TokenSizeSchema, TOKEN_TYPES, TOKEN_DISPOSITIONS, TOKEN_DISPLAY_MODES } from './tokens';
import { MapSideSchema, GridSizeSchema, FeetPerSquareSchema, MAP_LIMITS, MAX_FOG_CELLS } from './maps';
import { TOKEN_LIMITS } from './tokenLimits';
import { CAMPAIGN_LIMITS } from './campaignLimits';

// ── Limits ──────────────────────────────────────────────────────────────────

// Tokens on a map, walls and lights are held to the app's own limits
// (MAP_LIMITS, validators/walls.ts), so anything the app stores imports.
// How many maps, pictures and sound files an archive holds is bounded by
// MAX_FILE_COUNT, since each is a file in it. Creatures and token templates
// have counts of their own: bounded only by their 10 MB list, a list of
// 65,000 minimal creatures stopped the server, and 2,000 import in about
// 20 MB. The export checks the same bounds, so a campaign that exports
// imports again. (Counts of 50 maps, 200 creatures, 500 templates and 500
// files used to refuse or cut archives a campaign could export.)
export const IMPORT_LIMITS = {
  MAX_JSON_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB per JSON file
  MAX_FILE_COUNT: 1000,
  MAX_CREATURES: 2000,
  MAX_TOKEN_TEMPLATES: 2000,
  // How deeply a data file may nest objects and lists. An export reaches
  // six, at a map token's stat block's proficiencies; this is five times that.
  MAX_JSON_DEPTH: 32,
  // How many values and members one map file may hold, counted on its text
  // before it is parsed. The largest map an export writes (a 500 by 500 fog,
  // 5,000 walls, and as many tokens carrying the longest SRD stat block as
  // fit in the 10 MB a file may hold, about 760) holds about 340,000; 10 MB
  // of tiny walls or empty objects holds over a million and cost several
  // times as much to parse.
  MAX_MAP_VALUES: 1_000_000,
  FORMAT_VERSION: 1,
} as const;

// ── Helper sub-schemas ──────────────────────────────────────────────────────

const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
}).strip();

// Tokens and templates in an archive are stored as they arrive, so they are
// held to what the live routes accept: the same size and hit-point limits and
// the same allowlists. A value outside them falls back to the default instead
// of refusing the whole map, as the creature templates below already do; a
// stored value the routes refuse would otherwise vanish for players (the role
// filter matches layers exactly) or fail the next time the DM edited it.
const TokenLayerSchema = z.enum(['token', 'spirit']).default('token').catch('token');
const TokenTypeSchema = z.enum(TOKEN_TYPES);
const TokenDispositionSchema = z.enum(TOKEN_DISPOSITIONS).nullable().default(null).catch(null);
const TokenDisplayModeSchema = z.enum(TOKEN_DISPLAY_MODES);
const ImportHpSchema = TokenHpSchema.nullable().optional().catch(null);

// Conditions are kept one at a time, so an over-long entry costs itself and
// not the list.
const ImportConditionsSchema = z
  .array(z.string().trim().max(TOKEN_LIMITS.maxConditionLength).catch(''))
  .max(TOKEN_LIMITS.maxConditions)
  .catch([])
  .transform((conditions) => conditions.filter((c) => c.length > 0));

// Stat blocks arriving in an archive are held to what the creature editor
// and the token routes accept, so an imported creature can be placed and
// saved. The importer cuts text and lists over those limits down to them.
const StatBlockSchema = NpcStatBlockSchema;

/**
 * A game system, as the database stores one. The importer checks it on its
 * own and imports the campaign or creature with none when it is not one, so
 * an unknown name costs nothing else.
 */
export const ImportGameSystemSchema = z.nativeEnum(GameSystem).nullable().optional();

// ── Manifest ────────────────────────────────────────────────────────────────

export const ManifestSchema = z.object({
  formatVersion: z.literal(IMPORT_LIMITS.FORMAT_VERSION),
  exportedAt: z.string().max(50),
  exportedFrom: z.string().max(100),
  campaignName: z.string().min(1).max(CAMPAIGN_LIMITS.maxNameLength),
  gameSystem: z.string().max(50),
  mapCount: z.number().int().min(0).max(IMPORT_LIMITS.MAX_FILE_COUNT),
  tokenCount: z.number().int().min(0),
  creatureCount: z.number().int().min(0),
  tokenTemplateCount: z.number().int().min(0),
  assetCount: z.number().int().min(0).max(IMPORT_LIMITS.MAX_FILE_COUNT),
  includesAudio: z.boolean(),
  totalSizeBytes: z.number().int().min(0),
}).strip();

// ── Campaign settings ───────────────────────────────────────────────────────

export const CampaignSettingsSchema = z.object({
  name: z.string().min(1).max(CAMPAIGN_LIMITS.maxNameLength),
  description: z.string().max(CAMPAIGN_LIMITS.maxDescriptionLength).nullable().optional(),
  gameSystem: z.unknown().optional(),
  // Both fall back to the default when an archive carries a value outside the
  // allowlist, so one bad field does not refuse the whole campaign.
  vibeSettings: ImportVibeSettingsSchema.optional().catch(undefined),
  currentVibe: z.string().max(100).nullable().optional(),
  spiritLayerEnabled: z.boolean().optional(),
  spiritLayerStyle: z.string().max(100, { abort: true }).regex(SPIRIT_STYLE_PATTERN).optional().catch(undefined),
  // Absent from archives made before the setting; such a campaign imports
  // with players allowed to draw, as every campaign had at the upgrade.
  playersMayDraw: z.boolean().optional().catch(undefined),
}).strip();

// ── Token (within a map) ────────────────────────────────────────────────────

// Each token is checked on its own (services/campaignImportContent.ts), so
// one the app cannot store costs only itself. Text over its limit is cut to
// it by the importer and the import says so; that is why name and notes
// have a limit here and no fallback. The importer gives every token a new
// id, rounds its position to whole squares and keeps it on the map.
export const ImportTokenSchema = z.object({
  // The token routes refuse a blank name; Duplicate and Edit Token send
  // an imported token through them.
  name: z.string().trim().max(200).transform((name) => name || 'Unnamed token'),
  imageUrl: z.string().max(500).optional().default('').catch(''),
  position: PositionSchema,
  size: TokenSizeSchema.catch({ width: 1, height: 1 }),
  layer: TokenLayerSchema,
  // A flag that is not one hides the token: the DM can show it again, and a
  // token they meant to keep hidden is not shown to the table.
  visible: z.boolean().optional().default(true).catch(false),
  rotation: z.number().min(0).max(360).optional().catch(undefined),
  conditions: ImportConditionsSchema.optional(),
  type: TokenTypeSchema.default('npc').catch('npc'),
  disposition: TokenDispositionSchema,
  hp: ImportHpSchema,
  showHpBar: z.boolean().optional().catch(undefined),
  notes: z.string().max(5000).nullable().optional(),
  initiative: z.number().nullable().optional().catch(null),
  sightRadius: TokenSightRadiusSchema.nullable().optional().catch(null),
  displayMode: TokenDisplayModeSchema.default('pog').catch('pog'),
  statBlock: StatBlockSchema.nullable().optional(),
  // A UUID, as the token routes require; anything else links to nothing.
  creatureTemplateId: z.uuid().nullable().optional().catch(null),
  obscured: z.boolean().optional().default(false).catch(false),
}).strip();

// ── Fog ─────────────────────────────────────────────────────────────────────

/**
 * A map's fog as the server keeps it (types/walls.ts FogState): one flag a
 * grid square. Fog whose grid is not the map's is rebuilt fully hidden the
 * first time it is used, so the importer keeps only fog that matches.
 */
export const ImportFogSchema = z
  .object({
    fogCols: z.number().int().min(1).max(MAP_LIMITS.maxSide),
    fogRows: z.number().int().min(1).max(MAP_LIMITS.maxSide),
    cellPx: z.number().int().min(MAP_LIMITS.minGridSize).max(MAP_LIMITS.maxGridSize),
    revealed: z.array(z.boolean()).max(MAX_FOG_CELLS),
  })
  .strip()
  .refine((fog) => fog.revealed.length === fog.fogCols * fog.fogRows, { message: 'Fog has a flag for each square' });

// ── Map data ────────────────────────────────────────────────────────────────

/**
 * A map's own fields. Only its size can refuse it: a map the app could not
 * hold, such as one wider than 500 squares, is left out with that reason.
 * Its name, tokens, walls, lights and fog are each checked on their own by
 * the importer, which cuts or leaves out what does not fit and says so.
 *
 * imageAssetRef is null when the export left the picture out (deleted, or one
 * the person exporting could not open): the map imports without a picture,
 * its walls, tokens and fog intact, and the DM gives it one in Edit Map.
 */
// A field checked by the importer on its own is z.unknown().optional() here:
// zod treats a missing z.unknown() key as an error since 4.4, and an archive
// may leave any of these out.
export const ImportMapSchema = z.object({
  name: z.unknown().optional(),
  imageAssetRef: z.string().max(200).nullable().optional().catch(null),
  spiritLayerAssetRef: z.string().max(200).nullable().optional().catch(null),
  // The limits every other path that stores a map applies (validators/maps.ts)
  width: MapSideSchema('Map width'),
  height: MapSideSchema('Map height'),
  gridSize: GridSizeSchema,
  feetPerSquare: FeetPerSquareSchema,
  diagonalRule: z.enum(['flat', 'alternating']).optional().catch(undefined),
  tokens: z.unknown().optional(),
  annotations: z.unknown().optional(),
  wallSegments: z.unknown().optional(),
  fogData: z.unknown().optional(),
  lightingEnabled: z.boolean().optional().catch(undefined),
  fogEnabled: z.boolean().optional().catch(undefined),
  globalIllumination: z.boolean().optional().catch(undefined),
  explorationEnabled: z.boolean().optional().catch(undefined),
  lights: z.unknown().optional(),
}).strip();

/**
 * A map's annotations. Nothing draws them yet, and the drawing tool will
 * define their shape, so each is kept as it is, within a bound.
 */
export const ImportAnnotationsSchema = z.array(z.record(z.string(), z.unknown())).max(500);

// ── Creature template ───────────────────────────────────────────────────────

export const CreatureTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  gameSystem: z.unknown().optional(),
  challengeRating: z.string().max(10).nullable().optional(),
  creatureType: z.string().max(200).nullable().optional(),
  alignment: z.string().max(100).nullable().optional(),
  imageAssetRef: z.string().max(200).nullable().optional(),
  statBlock: StatBlockSchema,
  size: TokenSizeSchema.optional().catch(undefined),
  // Allowlisted like the live create and update paths; a value outside it
  // falls back to the importer's default instead of being stored as a fourth
  // disposition the app cannot draw
  disposition: z.enum(TOKEN_DISPOSITIONS).optional().catch(undefined),
  displayMode: TokenDisplayModeSchema.optional().catch(undefined),
}).strip();

// ── Token template ──────────────────────────────────────────────────────────

export const TokenTemplateImportSchema = z.object({
  name: z.string().trim().min(1).max(200),
  imageAssetRef: z.string().max(200).nullable().optional(),
  // The importer applies the template defaults (object, pog, one square) to
  // whatever is dropped here.
  type: TokenTypeSchema.catch('object'),
  disposition: TokenDispositionSchema,
  displayMode: TokenDisplayModeSchema.optional().catch(undefined),
  size: TokenSizeSchema.optional().catch(undefined),
  notes: z.string().max(5000).nullable().optional(),
  hp: ImportHpSchema,
  showHpBar: z.boolean().optional(),
  statBlock: StatBlockSchema.nullable().optional(),
  sightRadius: TokenSightRadiusSchema.nullable().optional(),
}).strip();

// ── Asset manifest ──────────────────────────────────────────────────────────

/**
 * The asset types an export writes, and so the only ones an import takes. A
 * campaign's documents, and anyone's avatar, are not part of a campaign
 * archive.
 */
export const IMPORTABLE_ASSET_TYPES = ['MAP', 'TOKEN', 'AUDIO'] as const;

// The declared MIME type is kept for the log only: the stored type and file
// extension come from the file's own bytes, as on upload.
export const AssetEntrySchema = z.object({
  originalName: z.string().max(500),
  mimeType: z.string().max(100),
  type: z.enum(IMPORTABLE_ASSET_TYPES),
  fileSize: z.number().int().min(0),
}).strip();

// Each entry is checked on its own by the importer: one that is not an
// asset an archive carries (another asset type, say) is left out of the
// import and listed, as an asset whose content does not match is.
export const AssetManifestSchema = z.record(z.string().max(200), z.unknown())
  .refine(
    (obj) => Object.keys(obj).length <= IMPORT_LIMITS.MAX_FILE_COUNT,
    { message: `Asset manifest exceeds maximum of ${IMPORT_LIMITS.MAX_FILE_COUNT} assets` }
  );

// ── Types ───────────────────────────────────────────────────────────────────

export type ManifestData = z.infer<typeof ManifestSchema>;
export type CampaignSettingsData = z.infer<typeof CampaignSettingsSchema>;
export type ImportMapData = z.infer<typeof ImportMapSchema>;
export type ImportToken = z.infer<typeof ImportTokenSchema>;
export type AssetEntryData = z.infer<typeof AssetEntrySchema>;
export type CreatureTemplateData = z.infer<typeof CreatureTemplateSchema>;
export type TokenTemplateImportData = z.infer<typeof TokenTemplateImportSchema>;
export type AssetManifestData = z.infer<typeof AssetManifestSchema>;
