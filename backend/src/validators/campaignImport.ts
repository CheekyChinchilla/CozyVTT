/**
 * Campaign Import Zod Validation Schemas
 * Strict schemas for every JSON file inside a .cozyvtt archive.
 * All unknown/extra fields are stripped (.strip() mode).
 */

import { z } from 'zod';
import { VibeSettingsSchema } from './campaigns';
import { SPIRIT_STYLE_PATTERN } from '../utils/styleAllowlists';
import { createNpcStatBlockSchema, IMPORT_STAT_BLOCK_LIMITS } from './statBlock';
import { TokenHpSchema, TokenSightRadiusSchema, TokenSizeSchema, TOKEN_TYPES, TOKEN_DISPOSITIONS, TOKEN_DISPLAY_MODES } from './tokens';
import { MapSideSchema, GridSizeSchema, FeetPerSquareSchema, MAP_LIMITS, MAX_FOG_CELLS } from './maps';

// ── Limits ──────────────────────────────────────────────────────────────────

// Tokens on a map, walls and lights are held to the app's own limits
// (MAP_LIMITS, validators/walls.ts), so anything the app stores imports.
export const IMPORT_LIMITS = {
  MAX_MAPS: 50,
  MAX_CREATURES: 200,
  MAX_TOKEN_TEMPLATES: 500,
  MAX_ASSETS: 500,
  MAX_JSON_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB per JSON file
  MAX_FILE_COUNT: 1000,
  MAX_JSON_DEPTH: 20,
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
  .array(z.string().trim().max(60).catch(''))
  .max(50)
  .catch([])
  .transform((conditions) => conditions.filter((c) => c.length > 0));

// Stat blocks arriving in an archive validate against the same definition the
// creature and token-template routes use, with the looser import limits this
// file has always applied (see IMPORT_STAT_BLOCK_LIMITS).
const StatBlockSchema = createNpcStatBlockSchema(IMPORT_STAT_BLOCK_LIMITS);

// ── Manifest ────────────────────────────────────────────────────────────────

export const ManifestSchema = z.object({
  formatVersion: z.literal(IMPORT_LIMITS.FORMAT_VERSION),
  exportedAt: z.string().max(50),
  exportedFrom: z.string().max(100),
  campaignName: z.string().min(1).max(200),
  gameSystem: z.string().max(50),
  mapCount: z.number().int().min(0).max(IMPORT_LIMITS.MAX_MAPS),
  tokenCount: z.number().int().min(0),
  creatureCount: z.number().int().min(0).max(IMPORT_LIMITS.MAX_CREATURES),
  tokenTemplateCount: z.number().int().min(0).max(IMPORT_LIMITS.MAX_TOKEN_TEMPLATES),
  assetCount: z.number().int().min(0).max(IMPORT_LIMITS.MAX_ASSETS),
  includesAudio: z.boolean(),
  totalSizeBytes: z.number().int().min(0),
}).strip();

// ── Campaign settings ───────────────────────────────────────────────────────

export const CampaignSettingsSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  gameSystem: z.string().max(50).nullable().optional(),
  // Both fall back to the default when an archive carries a value outside the
  // allowlist, so one bad field does not refuse the whole campaign.
  vibeSettings: VibeSettingsSchema.optional().catch(undefined),
  currentVibe: z.string().max(100).nullable().optional(),
  spiritLayerEnabled: z.boolean().optional(),
  spiritLayerStyle: z.string().max(100, { abort: true }).regex(SPIRIT_STYLE_PATTERN).optional().catch(undefined),
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
export const ImportMapSchema = z.object({
  name: z.unknown(),
  imageAssetRef: z.string().max(200).nullable().optional().catch(null),
  spiritLayerAssetRef: z.string().max(200).nullable().optional().catch(null),
  // The limits every other path that stores a map applies (validators/maps.ts)
  width: MapSideSchema('Map width'),
  height: MapSideSchema('Map height'),
  gridSize: GridSizeSchema,
  feetPerSquare: FeetPerSquareSchema,
  diagonalRule: z.enum(['flat', 'alternating']).optional().catch(undefined),
  tokens: z.unknown(),
  annotations: z.unknown(),
  wallSegments: z.unknown(),
  fogData: z.unknown(),
  lightingEnabled: z.boolean().optional().catch(undefined),
  fogEnabled: z.boolean().optional().catch(undefined),
  globalIllumination: z.boolean().optional().catch(undefined),
  explorationEnabled: z.boolean().optional().catch(undefined),
  lights: z.unknown(),
}).strip();

/**
 * A map's annotations. Nothing draws them yet, and the drawing tool will
 * define their shape, so each is kept as it is, within a bound.
 */
export const ImportAnnotationsSchema = z.array(z.record(z.string(), z.unknown())).max(500);

// ── Creature template ───────────────────────────────────────────────────────

export const CreatureTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  gameSystem: z.string().max(50).nullable().optional(),
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
  name: z.string().min(1).max(200),
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
    (obj) => Object.keys(obj).length <= IMPORT_LIMITS.MAX_ASSETS,
    { message: `Asset manifest exceeds maximum of ${IMPORT_LIMITS.MAX_ASSETS} assets` }
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
