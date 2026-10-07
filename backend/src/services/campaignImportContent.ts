/**
 * What a campaign archive's maps, tokens, walls and lights become on import.
 *
 * An archive is held to what the app itself stores, so everything imported
 * can be opened, edited and saved again. Text or a list over its limit is
 * cut down to it, and the import says so. Something the app cannot store at
 * all, a token with no position or a wall of a kind it does not know, is
 * left out on its own, and the import lists it. A whole map is left out only
 * when the map itself is not one the app could hold, such as one wider than
 * 500 squares.
 *
 * Everything said is collected in an ImportReport, which the import's answer
 * carries, so the person importing learns what changed on the way in.
 */

import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  ImportMapSchema,
  ImportTokenSchema,
  ImportFogSchema,
  ImportAnnotationsSchema,
  ImportGameSystemSchema,
  CreatureTemplateSchema,
  TokenTemplateImportSchema,
  type ImportToken,
} from '../validators/campaignImport';
import { MAP_LIMITS, GEOMETRY_MARGIN_SQUARES, wallWithinMap, lightWithinMap } from '../validators/maps';
import { WallSegmentSchema, LightSourceSchema, MAX_WALL_SEGMENTS, MAX_LIGHT_SOURCES } from '../validators/walls';
import { clampTokenPosition } from '../utils/mapTokens';

// ── The report ──────────────────────────────────────────────────────────────

export type SkippedKind = 'map' | 'token' | 'creature' | 'tokenTemplate' | 'asset';

/** Something the archive held that the import left out, and why. */
export interface SkippedItem {
  kind: SkippedKind;
  name: string;
  reason: string;
}

/**
 * How many changes and how many left-out items an answer lists. An archive
 * from the app has none or a few; a crafted one could have thousands, and
 * the rest are counted.
 */
const MAX_LISTED = 200;

export class ImportReport {
  private readonly warnings: string[] = [];
  private readonly skipped: SkippedItem[] = [];
  private unlisted = 0;

  /** Something imported in a changed form. */
  warn(message: string): void {
    if (this.warnings.length < MAX_LISTED) this.warnings.push(message);
    else this.unlisted++;
  }

  /** Something left out of the import. */
  skip(kind: SkippedKind, name: string, reason: string): void {
    if (this.skipped.length < MAX_LISTED) this.skipped.push({ kind, name, reason });
    else this.unlisted++;
  }

  result(): { warnings: string[]; skipped: SkippedItem[] } {
    const warnings = [...this.warnings];
    if (this.unlisted > 0) warnings.push(`${this.unlisted.toLocaleString('en-US')} more changes and left-out items are not listed here.`);
    return { warnings, skipped: [...this.skipped] };
  }
}

// ── Cutting values down to their limits ─────────────────────────────────────

/**
 * The first `max` characters of `text`, never splitting a character that
 * takes two: half of one cannot be stored.
 */
export function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** A name to show in the report: trimmed, and cut short when it is long. */
export function label(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const name = value.trim();
  return name.length > 80 ? `${cutText(name, 80)}…` : name;
}

type Fitted<T> = { ok: true; value: T; cut: PropertyKey[][] } | { ok: false; issue: z.core.$ZodIssue };

/** Replace the value at `path` in `root` by `change` of it, in place. */
function changeAt(root: unknown, path: PropertyKey[], change: (value: unknown) => unknown): void {
  if (path.length === 0) return;
  let holder: unknown = root;
  for (const key of path.slice(0, -1)) {
    if (holder === null || typeof holder !== 'object') return;
    holder = (holder as Record<PropertyKey, unknown>)[key];
  }
  if (holder === null || typeof holder !== 'object') return;
  const last = path[path.length - 1];
  const record = holder as Record<PropertyKey, unknown>;
  record[last] = change(record[last]);
}

/**
 * Parse `value` with `schema`, first cutting any text or list the schema
 * finds too long down to the length it allows. Gives the parsed value and
 * the paths that were cut, or the first problem that cutting cannot fix.
 * `value` itself is never changed.
 */
export function fitToSchema<T>(schema: z.ZodType<T>, value: unknown): Fitted<T> {
  let current = value;
  const cut: PropertyKey[][] = [];
  // Cutting one field can bring the next problem to light; two rounds of
  // cuts cover a list of entries whose text is also too long.
  for (let round = 0; ; round++) {
    const parsed = schema.safeParse(current);
    if (parsed.success) return { ok: true, value: parsed.data, cut };
    const cuttable = parsed.error.issues.filter(
      (issue): issue is z.core.$ZodIssueTooBig =>
        issue.code === 'too_big' && (issue.origin === 'string' || issue.origin === 'array') && typeof issue.maximum === 'number'
    );
    if (cuttable.length === 0 || round === 2) return { ok: false, issue: parsed.error.issues[0] };
    if (current === value) current = structuredClone(value);
    for (const issue of cuttable) {
      const max = Number(issue.maximum);
      changeAt(current, issue.path, (found) =>
        typeof found === 'string' ? cutText(found, max) : Array.isArray(found) ? found.slice(0, max) : found
      );
      cut.push(issue.path);
    }
  }
}

/** A Zod problem in words, with where it was. */
export function describeIssue(issue: z.core.$ZodIssue): string {
  const where = issue.path.length ? ` (${issue.path.map(String).join('.')})` : '';
  return `${issue.message}${where}`;
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

// ── Maps ────────────────────────────────────────────────────────────────────

export interface MapContext {
  /** The map's place in the archive, from 0. */
  index: number;
  importTokens: boolean;
  /** The new address of an asset the archive names, or null. */
  remapAsset: (ref: string | null | undefined) => string | null;
  report: ImportReport;
}

/** A map ready to be written, without its id and campaign. */
export interface PreparedMap {
  data: Omit<Prisma.MapUncheckedCreateInput, 'id' | 'campaignId'>;
  tokenCount: number;
}

interface PlacedToken extends Omit<ImportToken, 'position'> {
  id: string;
  imageUrl: string;
  position: { x: number; y: number };
  characterId: null;
  controlledBy: null;
}

/**
 * What the map in `raw` imports as, or null when the app could not hold it,
 * which is then listed with the reason. Everything said about it goes to
 * the context's report.
 */
export function prepareMap(raw: unknown, ctx: MapContext): PreparedMap | null {
  const { report } = ctx;
  const fallbackName = `Map ${ctx.index + 1}`;
  const rawName = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>).name : undefined;

  const parsed = ImportMapSchema.safeParse(raw);
  if (!parsed.success) {
    report.skip('map', label(rawName, fallbackName), parsed.error.issues[0]?.message ?? 'It is not a map CozyVTT can read.');
    return null;
  }
  const map = parsed.data;

  // The name, as the map routes take it: trimmed, not blank, 200 at most.
  let name = typeof map.name === 'string' ? map.name.trim() : '';
  if (name === '') {
    name = fallbackName;
    report.warn(`${fallbackName} had no name, so it was named "${fallbackName}".`);
  } else if (name.length > MAP_LIMITS.maxNameLength) {
    report.warn(`Map "${label(name, fallbackName)}": shortened its name to ${MAP_LIMITS.maxNameLength} characters.`);
    name = cutText(name, MAP_LIMITS.maxNameLength);
  }
  const say = (what: string) => report.warn(`Map "${label(name, fallbackName)}": ${what}`);

  const tokens = ctx.importTokens ? prepareTokens(map.tokens, map, name, ctx) : [];
  const wallSegments = prepareWalls(map.wallSegments, map, say);
  const lights = prepareLights(map.lights, map, say);

  // Fog whose grid is not the map's would be rebuilt fully hidden the first
  // time it is used, so it is left behind without a word; fog that cannot be
  // read at all is worth mentioning.
  let fogData: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
  if (map.fogData !== undefined && map.fogData !== null) {
    const fog = ImportFogSchema.safeParse(map.fogData);
    if (!fog.success) say('reset its fog, which could not be read; every square starts hidden.');
    else if (fog.data.fogCols === map.width && fog.data.fogRows === map.height && fog.data.cellPx === map.gridSize) fogData = fog.data;
  }

  let annotations: Prisma.InputJsonValue = [];
  if (map.annotations !== undefined && map.annotations !== null) {
    const parsedAnnotations = ImportAnnotationsSchema.safeParse(map.annotations);
    if (parsedAnnotations.success) annotations = parsedAnnotations.data as Prisma.InputJsonValue;
    else say('left out its annotations, which could not be read.');
  }

  const imageUrl = ctx.remapAsset(map.imageAssetRef) || '';
  return {
    tokenCount: tokens.length,
    data: {
      name,
      imageUrl,
      baseLayerUrl: imageUrl,
      spiritLayerUrl: ctx.remapAsset(map.spiritLayerAssetRef),
      width: map.width,
      height: map.height,
      gridSize: map.gridSize,
      feetPerSquare: map.feetPerSquare,
      diagonalRule: map.diagonalRule ?? 'flat',
      tokens: tokens as unknown as Prisma.InputJsonValue,
      annotations,
      wallSegments: wallSegments as unknown as Prisma.InputJsonValue,
      fogData,
      lightingEnabled: map.lightingEnabled ?? false,
      // Absent in archives from before 1.5.0: leave the column default, which
      // keeps fog on, as those maps always had it.
      ...(map.fogEnabled !== undefined ? { fogEnabled: map.fogEnabled } : {}),
      ...(map.globalIllumination !== undefined ? { globalIllumination: map.globalIllumination } : {}),
      ...(map.explorationEnabled !== undefined ? { explorationEnabled: map.explorationEnabled } : {}),
      lights: lights as unknown as Prisma.InputJsonValue,
    },
  };
}

/** A map's tokens, each held to what the token routes store. */
function prepareTokens(
  raw: unknown,
  map: { width: number; height: number },
  mapName: string,
  ctx: MapContext
): PlacedToken[] {
  const { report } = ctx;
  const say = (what: string) => report.warn(`Map "${label(mapName, `Map ${ctx.index + 1}`)}": ${what}`);
  const where = `"${label(mapName, `Map ${ctx.index + 1}`)}"`;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    say('left out its tokens, which could not be read.');
    return [];
  }

  // A map holds as many tokens as the app lets one hold, the first in its list.
  const listed = raw.slice(0, MAP_LIMITS.maxTokens);
  if (raw.length > listed.length) {
    report.skip(
      'token',
      `${count(raw.length - listed.length, 'token')} on ${where}`,
      `A map can hold ${MAP_LIMITS.maxTokens.toLocaleString('en-US')} tokens. These were the last in its list.`
    );
  }

  const tally = { names: 0, notes: 0, statBlocks: 0, statBlocksDropped: 0, moved: 0 };
  const tokens: PlacedToken[] = [];
  for (const entry of listed) {
    let fitted = fitToSchema(ImportTokenSchema, entry);
    // A stat block that cannot be made to fit costs the token only it.
    if (!fitted.ok && fitted.issue.path[0] === 'statBlock' && entry !== null && typeof entry === 'object') {
      fitted = fitToSchema(ImportTokenSchema, { ...entry, statBlock: null });
      if (fitted.ok) tally.statBlocksDropped++;
    }
    if (!fitted.ok) {
      const name = entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>).name : undefined;
      report.skip('token', `"${label(name, 'Unnamed token')}" on ${where}`, describeIssue(fitted.issue));
      continue;
    }
    const cutFields = new Set(fitted.cut.map((path) => path[0]));
    if (cutFields.has('name')) tally.names++;
    if (cutFields.has('notes')) tally.notes++;
    if (cutFields.has('statBlock')) tally.statBlocks++;

    const token = fitted.value;
    // Whole squares, as the client places tokens, with the whole footprint
    // on the map, as the token routes keep it.
    const square = { x: Math.round(token.position.x), y: Math.round(token.position.y) };
    const position = clampTokenPosition(square, token.size, map);
    if (position.x !== token.position.x || position.y !== token.position.y) tally.moved++;

    tokens.push({
      ...token,
      id: randomUUID(),
      imageUrl: ctx.remapAsset(token.imageUrl) || '',
      position,
      characterId: null,
      controlledBy: null,
    });
  }

  if (tally.names) say(`shortened the names of ${count(tally.names, 'token')} to 200 characters.`);
  if (tally.notes) say(`shortened the notes of ${count(tally.notes, 'token')} to 5,000 characters.`);
  if (tally.statBlocks) say(`shortened text or lists in the stat blocks of ${count(tally.statBlocks, 'token')} to what the app keeps.`);
  if (tally.statBlocksDropped) {
    say(`left the stat block off ${count(tally.statBlocksDropped, 'token')}, which the app cannot store; ${tally.statBlocksDropped === 1 ? 'the token was' : 'the tokens were'} kept.`);
  }
  if (tally.moved) say(`moved ${count(tally.moved, 'token')} onto whole squares inside the map.`);
  return tokens;
}

type MapGeometry = { width: number; height: number; gridSize: number };

/**
 * A map's walls and doors, each as the wall routes store one, with a new
 * id: ids from an archive were never checked, and two walls sharing one
 * were each edited and deleted as the other.
 */
function prepareWalls(raw: unknown, map: MapGeometry, say: (what: string) => void): unknown[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    say('left out its walls, which could not be read.');
    return [];
  }
  const walls: z.infer<typeof WallSegmentSchema>[] = [];
  let invalid = 0;
  let outside = 0;
  for (const entry of raw) {
    const parsed = WallSegmentSchema.safeParse({ ...(entry !== null && typeof entry === 'object' ? entry : {}), id: randomUUID() });
    if (!parsed.success) invalid++;
    else if (!wallWithinMap(parsed.data, map)) outside++;
    else walls.push(parsed.data);
  }
  const kept = walls.slice(0, MAX_WALL_SEGMENTS);
  if (invalid) say(`left out ${count(invalid, 'wall or door', 'walls or doors')} the app cannot store.`);
  if (outside) say(`left out ${count(outside, 'wall or door', 'walls or doors')} more than ${GEOMETRY_MARGIN_SQUARES} squares outside the map.`);
  if (walls.length > kept.length) {
    say(`left out the last ${count(walls.length - kept.length, 'wall or door', 'walls or doors')}: a map can hold ${MAX_WALL_SEGMENTS.toLocaleString('en-US')}.`);
  }
  return kept;
}

/** A map's lights, each as the light routes store one, with a new id. */
function prepareLights(raw: unknown, map: MapGeometry, say: (what: string) => void): unknown[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    say('left out its lights, which could not be read.');
    return [];
  }
  const lights: z.infer<typeof LightSourceSchema>[] = [];
  let invalid = 0;
  let outside = 0;
  for (const entry of raw) {
    const parsed = LightSourceSchema.safeParse({ ...(entry !== null && typeof entry === 'object' ? entry : {}), id: randomUUID() });
    if (!parsed.success) invalid++;
    else if (!lightWithinMap(parsed.data, map)) outside++;
    else lights.push(parsed.data);
  }
  const kept = lights.slice(0, MAX_LIGHT_SOURCES);
  if (invalid) say(`left out ${count(invalid, 'light')} the app cannot store.`);
  if (outside) say(`left out ${count(outside, 'light')} more than ${GEOMETRY_MARGIN_SQUARES} squares outside the map.`);
  if (lights.length > kept.length) say(`left out the last ${count(lights.length - kept.length, 'light')}: a map can hold ${MAX_LIGHT_SOURCES}.`);
  return kept;
}

// ── Game systems ────────────────────────────────────────────────────────────

/**
 * The game system an archive names, or null with a word in the report when
 * it is not one this server has. `whose` begins the report's sentence: "The
 * campaign's", or `Creature "Wolf": its`.
 */
export function importedGameSystem(value: unknown, whose: string, report: ImportReport): z.infer<typeof ImportGameSystemSchema> | null {
  const parsed = ImportGameSystemSchema.safeParse(value);
  if (parsed.success) return parsed.data ?? null;
  const named = typeof value === 'string' ? ` "${label(value, '')}"` : '';
  report.warn(`${whose} game system${named} is not one this server knows, so it was imported with none.`);
  return null;
}

// ── Creatures and token templates ───────────────────────────────────────────

export interface LibraryContext {
  remapAsset: (ref: string | null | undefined) => string | null;
  report: ImportReport;
}

/** The fields of a creature or template, in words, for the report. */
const FIELD_WORDS: Record<string, string> = {
  name: 'name',
  challengeRating: 'challenge rating',
  creatureType: 'creature type',
  alignment: 'alignment',
  notes: 'notes',
};

/** Say which of an item's fields were cut, apart from its stat block. */
function sayCut(cut: PropertyKey[][], say: (what: string) => void): void {
  const fields = [...new Set(cut.map((path) => String(path[0])))].filter((field) => field !== 'statBlock');
  if (fields.length > 0) say(`shortened its ${fields.map((f) => FIELD_WORDS[f] ?? f).join(', ')} to the length the app keeps.`);
  if (cut.some((path) => path[0] === 'statBlock')) say('shortened text or lists in its stat block to what the creature editor keeps.');
}

type CreatureRow = Omit<Prisma.CreatureTemplateCreateManyInput, 'id' | 'createdById' | 'campaignId'>;

/**
 * A custom creature from the archive, held to what the creature editor
 * saves, or null when it has no stat block the app can store; it is then
 * listed with the reason.
 */
export function prepareCreature(raw: unknown, ctx: LibraryContext): CreatureRow | null {
  const fallback = 'Unnamed creature';
  const rawName = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>).name : undefined;
  const fitted = fitToSchema(CreatureTemplateSchema, raw);
  if (!fitted.ok) {
    ctx.report.skip('creature', label(rawName, fallback), describeIssue(fitted.issue));
    return null;
  }
  const c = fitted.value;
  const whose = `Creature "${label(c.name, fallback)}"`;
  sayCut(fitted.cut, (what) => ctx.report.warn(`${whose}: ${what}`));
  return {
    name: c.name,
    gameSystem: importedGameSystem(c.gameSystem, `${whose}: its`, ctx.report),
    source: 'custom',
    challengeRating: c.challengeRating || null,
    creatureType: c.creatureType || null,
    alignment: c.alignment || null,
    imageUrl: ctx.remapAsset(c.imageAssetRef),
    statBlock: c.statBlock as Prisma.InputJsonValue,
    size: (c.size || { width: 1, height: 1 }) as Prisma.InputJsonValue,
    disposition: c.disposition || 'hostile',
    displayMode: c.displayMode || 'pog',
  };
}

type TokenTemplateRow = Omit<Prisma.TokenTemplateCreateManyInput, 'id' | 'createdById' | 'campaignId'>;

/**
 * A token template from the archive, held to what the template routes
 * save, or null when it cannot be stored; it is then listed with the
 * reason. A stat block that cannot be made to fit is left off on its own.
 */
export function prepareTokenTemplate(raw: unknown, ctx: LibraryContext): TokenTemplateRow | null {
  const fallback = 'Unnamed template';
  const rawName = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>).name : undefined;
  let fitted = fitToSchema(TokenTemplateImportSchema, raw);
  let droppedStatBlock = false;
  if (!fitted.ok && fitted.issue.path[0] === 'statBlock' && raw !== null && typeof raw === 'object') {
    fitted = fitToSchema(TokenTemplateImportSchema, { ...raw, statBlock: null });
    droppedStatBlock = fitted.ok;
  }
  if (!fitted.ok) {
    ctx.report.skip('tokenTemplate', label(rawName, fallback), describeIssue(fitted.issue));
    return null;
  }
  const t = fitted.value;
  const whose = `Token template "${label(t.name, fallback)}"`;
  sayCut(fitted.cut, (what) => ctx.report.warn(`${whose}: ${what}`));
  if (droppedStatBlock) ctx.report.warn(`${whose}: left off its stat block, which the app cannot store; the template was kept.`);
  return {
    name: t.name,
    imageUrl: ctx.remapAsset(t.imageAssetRef),
    type: t.type || 'object',
    disposition: t.disposition || null,
    displayMode: t.displayMode || 'pog',
    size: (t.size || { width: 1, height: 1 }) as Prisma.InputJsonValue,
    notes: t.notes || null,
    hp: t.hp ? (t.hp as Prisma.InputJsonValue) : Prisma.JsonNull,
    showHpBar: t.showHpBar ?? false,
    statBlock: t.statBlock ? (t.statBlock as Prisma.InputJsonValue) : Prisma.JsonNull,
    sightRadius: t.sightRadius ?? null,
  };
}
