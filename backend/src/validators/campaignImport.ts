/**
 * Campaign Import Zod Validation Schemas
 * Strict schemas for every JSON file inside a .cozyvtt archive.
 * All unknown/extra fields are stripped (.strip() mode).
 */

import { z } from 'zod';

// ── Limits ──────────────────────────────────────────────────────────────────

export const IMPORT_LIMITS = {
  MAX_MAPS: 50,
  MAX_TOKENS_PER_MAP: 500,
  MAX_CREATURES: 200,
  MAX_TOKEN_TEMPLATES: 500,
  MAX_ASSETS: 500,
  MAX_JSON_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB per JSON file
  MAX_FILE_COUNT: 1000,
  MAX_JSON_DEPTH: 20,
  FORMAT_VERSION: 1,
} as const;

// ── Helper sub-schemas ──────────────────────────────────────────────────────

const SizeSchema = z.object({
  width: z.number().int().min(1).max(100),
  height: z.number().int().min(1).max(100),
}).strip();

const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
}).strip();

const HpSchema = z.object({
  current: z.number().int().min(0),
  max: z.number().int().min(1),
  temp: z.number().int().min(0),
}).strip();

const NameDescPairSchema = z.object({
  name: z.string().max(500),
  description: z.string().max(10000),
}).strip();

const StatBlockSchema = z.object({
  ac: z.number().int().min(0).max(99),
  speed: z.string().max(500),
  abilities: z.object({
    str: z.number().int().min(0).max(30),
    dex: z.number().int().min(0).max(30),
    con: z.number().int().min(0).max(30),
    int: z.number().int().min(0).max(30),
    wis: z.number().int().min(0).max(30),
    cha: z.number().int().min(0).max(30),
  }).strip(),
  savingThrows: z.record(z.string(), z.number()).optional(),
  skills: z.record(z.string(), z.number()).optional(),
  damageVulnerabilities: z.string().max(500).optional(),
  damageResistances: z.string().max(500).optional(),
  damageImmunities: z.string().max(500).optional(),
  conditionImmunities: z.string().max(500).optional(),
  senses: z.string().max(500).optional(),
  languages: z.string().max(500).optional(),
  challengeRating: z.string().max(10).optional(),
  xp: z.number().int().min(0).optional(),
  traits: z.array(NameDescPairSchema).max(100).optional(),
  actions: z.array(NameDescPairSchema).max(100).optional(),
  bonusActions: z.array(NameDescPairSchema).max(100).optional(),
  reactions: z.array(NameDescPairSchema).max(100).optional(),
  legendaryActions: z.array(NameDescPairSchema).max(100).optional(),
  creatureType: z.string().max(200).optional(),
  alignment: z.string().max(100).optional(),
  gameSystem: z.string().max(50).optional(),
  notes: z.string().max(5000).optional(),
}).passthrough();

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

const VibePeriodSchema = z.object({
  name: z.string().max(100),
  hue: z.string().max(50),
  filter: z.string().max(200),
  audio: z.string().max(500).nullable().optional(),
}).strip();

export const CampaignSettingsSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  gameSystem: z.string().max(50).nullable().optional(),
  vibeSettings: z.object({
    periods: z.array(VibePeriodSchema).max(20),
  }).passthrough().optional(),
  currentVibe: z.string().max(100).nullable().optional(),
  spiritLayerEnabled: z.boolean().optional(),
  spiritLayerStyle: z.string().max(100).optional(),
}).strip();

// ── Wall segment ────────────────────────────────────────────────────────────

const WallSegmentSchema = z.object({
  id: z.string().max(100),
  x1: z.number().finite(),
  y1: z.number().finite(),
  x2: z.number().finite(),
  y2: z.number().finite(),
  type: z.string().max(50),
}).strip();

// ── Light source ────────────────────────────────────────────────────────────

const LightSourceSchema = z.object({
  id: z.string().max(100),
  x: z.number().finite(),
  y: z.number().finite(),
  brightRadius: z.number().min(0).max(200),
  dimRadius: z.number().min(0).max(200),
  color: z.string().max(20),
  enabled: z.boolean(),
}).strip();

// ── Token (within a map) ────────────────────────────────────────────────────

const TokenSchema = z.object({
  id: z.string().max(100).optional(),
  name: z.string().max(200),
  imageUrl: z.string().max(500).optional().default(''),
  position: PositionSchema,
  size: SizeSchema,
  layer: z.string().max(20).optional().default('token'),
  visible: z.boolean().optional().default(true),
  controlledBy: z.string().max(100).nullable().optional(),
  rotation: z.number().min(0).max(360).optional(),
  conditions: z.array(z.string().max(100)).max(50).optional(),
  type: z.string().max(20).optional().default('npc'),
  disposition: z.string().max(20).nullable().optional(),
  hp: HpSchema.nullable().optional(),
  showHpBar: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
  initiative: z.number().nullable().optional(),
  sightRadius: z.number().min(0).max(200).optional(),
  displayMode: z.string().max(20).optional(),
  statBlock: StatBlockSchema.nullable().optional(),
  creatureTemplateId: z.string().max(100).nullable().optional(),
}).strip();

// ── Map data ────────────────────────────────────────────────────────────────

export const MapDataSchema = z.object({
  name: z.string().min(1).max(200),
  imageAssetRef: z.string().max(200),
  spiritLayerAssetRef: z.string().max(200).nullable().optional(),
  width: z.number().int().min(1).max(500),
  height: z.number().int().min(1).max(500),
  gridSize: z.number().int().min(10).max(200),
  feetPerSquare: z.number().int().min(1).max(100),
  diagonalRule: z.enum(['flat', 'alternating']).optional(),
  tokens: z.array(TokenSchema).max(IMPORT_LIMITS.MAX_TOKENS_PER_MAP),
  annotations: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
  wallSegments: z.array(WallSegmentSchema).max(5000).optional(),
  fogData: z.record(z.string(), z.unknown()).nullable().optional(),
  lightingEnabled: z.boolean().optional(),
  lights: z.array(LightSourceSchema).max(200).optional(),
}).strip();

// ── Creature template ───────────────────────────────────────────────────────

export const CreatureTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  gameSystem: z.string().max(50).nullable().optional(),
  challengeRating: z.string().max(10).nullable().optional(),
  creatureType: z.string().max(200).nullable().optional(),
  alignment: z.string().max(100).nullable().optional(),
  imageAssetRef: z.string().max(200).nullable().optional(),
  statBlock: StatBlockSchema,
  size: SizeSchema.optional(),
  disposition: z.string().max(20).optional(),
  displayMode: z.string().max(20).optional(),
}).strip();

// ── Token template ──────────────────────────────────────────────────────────

export const TokenTemplateImportSchema = z.object({
  name: z.string().min(1).max(200),
  imageAssetRef: z.string().max(200).nullable().optional(),
  type: z.string().max(20),
  disposition: z.string().max(20).nullable().optional(),
  displayMode: z.string().max(20).optional(),
  size: SizeSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  hp: HpSchema.nullable().optional(),
  showHpBar: z.boolean().optional(),
  statBlock: StatBlockSchema.nullable().optional(),
  sightRadius: z.number().min(0).max(200).nullable().optional(),
}).strip();

// ── Asset manifest ──────────────────────────────────────────────────────────

const AssetEntrySchema = z.object({
  originalName: z.string().max(500),
  mimeType: z.string().max(100),
  type: z.string().max(20), // MAP, TOKEN, AUDIO
  fileSize: z.number().int().min(0),
}).strip();

export const AssetManifestSchema = z.record(z.string().max(200), AssetEntrySchema)
  .refine(
    (obj) => Object.keys(obj).length <= IMPORT_LIMITS.MAX_ASSETS,
    { message: `Asset manifest exceeds maximum of ${IMPORT_LIMITS.MAX_ASSETS} assets` }
  );

// ── Types ───────────────────────────────────────────────────────────────────

export type ManifestData = z.infer<typeof ManifestSchema>;
export type CampaignSettingsData = z.infer<typeof CampaignSettingsSchema>;
export type MapData = z.infer<typeof MapDataSchema>;
export type CreatureTemplateData = z.infer<typeof CreatureTemplateSchema>;
export type TokenTemplateImportData = z.infer<typeof TokenTemplateImportSchema>;
export type AssetManifestData = z.infer<typeof AssetManifestSchema>;
