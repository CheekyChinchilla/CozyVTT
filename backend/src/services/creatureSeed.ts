/**
 * creatureSeed.ts
 * Service that fetches D&D 5e SRD monsters from Open5e API and seeds the
 * CreatureTemplate table. Used by both the CLI script and the API endpoint.
 *
 * SRD 5.1 content is used under CC BY 4.0, and reaches us through Open5e.
 * See SRD_ATTRIBUTION.md for the notice and why that licence rather than the OGL.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { normalizeSkillKey } from '../utils/rules/dnd5e';
import { NpcStatBlockSchema } from '../validators/statBlock';
import { toJson } from '../utils/prisma-json';
import logger from '../utils/logger';

// ─── Open5e API Types ───────────────────────────────────────────

interface Open5eMonster {
  slug: string;
  name: string;
  size: string;
  type: string;
  subtype: string;
  group: string | null;
  alignment: string;
  armor_class: number;
  armor_desc: string;
  hit_points: number;
  hit_dice: string;
  speed: Record<string, number>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  strength_save: number | null;
  dexterity_save: number | null;
  constitution_save: number | null;
  intelligence_save: number | null;
  wisdom_save: number | null;
  charisma_save: number | null;
  skills: Record<string, number>;
  senses: string;
  languages: string;
  challenge_rating: string;
  cr: number;
  actions: Array<{ name: string; desc: string }> | null;
  bonus_actions: Array<{ name: string; desc: string }> | null;
  reactions: Array<{ name: string; desc: string }> | null;
  special_abilities: Array<{ name: string; desc: string }> | null;
  legendary_desc: string;
  legendary_actions: Array<{ name: string; desc: string }> | null;
  damage_vulnerabilities: string;
  damage_resistances: string;
  damage_immunities: string;
  condition_immunities: string;
  document__slug: string;
  document__title: string;
}

// ─── Size mapping ───────────────────────────────────────────────

const SIZE_MAP: Record<string, { width: number; height: number }> = {
  Tiny:       { width: 1, height: 1 },
  Small:      { width: 1, height: 1 },
  Medium:     { width: 1, height: 1 },
  Large:      { width: 2, height: 2 },
  Huge:       { width: 3, height: 3 },
  Gargantuan: { width: 4, height: 4 },
};

// ─── CR to XP lookup (SRD standard) ────────────────────────────

const CR_XP: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

// ─── Transform Open5e monster to our stat block ─────────────────

export function transformMonster(m: Open5eMonster) {
  // A creature with no speed listed moves at 0 ft., rather than stopping the seed.
  const speedParts = Object.entries(m.speed ?? {})
    .map(([type, val]) => (type === 'walk' ? `${val} ft.` : `${type} ${val} ft.`));
  const speedStr = speedParts.join(', ') || '0 ft.';

  const savingThrows: Record<string, number> = {};
  if (m.strength_save !== null) savingThrows.str = m.strength_save;
  if (m.dexterity_save !== null) savingThrows.dex = m.dexterity_save;
  if (m.constitution_save !== null) savingThrows.con = m.constitution_save;
  if (m.intelligence_save !== null) savingThrows.int = m.intelligence_save;
  if (m.wisdom_save !== null) savingThrows.wis = m.wisdom_save;
  if (m.charisma_save !== null) savingThrows.cha = m.charisma_save;

  const rawSkills = m.skills ?? {};
  const normalisedSkills: Record<string, number> | undefined =
    Object.keys(rawSkills).length > 0
      ? Object.fromEntries(
          Object.entries(rawSkills).map(([key, value]) => [normalizeSkillKey(key), value])
        )
      : undefined;

  const creatureType = m.subtype
    ? `${m.size} ${m.type} (${m.subtype})`
    : `${m.size} ${m.type}`;

  const statBlock = {
    ac: m.armor_class,
    hpMax: m.hit_points,
    hitDice: m.hit_dice || undefined,
    speed: speedStr,
    abilities: {
      str: m.strength, dex: m.dexterity, con: m.constitution,
      int: m.intelligence, wis: m.wisdom, cha: m.charisma,
    },
    savingThrows: Object.keys(savingThrows).length > 0 ? savingThrows : undefined,
    // Open5e uses its own lowercase keys, including snake_case for multi-word
    // skills ("animal_handling"). Normalising on import means the skill lookup
    // recognises them, so they keep their ability association in the roll
    // picker instead of being treated as unknown custom skills.
    skills: normalisedSkills,
    damageVulnerabilities: m.damage_vulnerabilities || undefined,
    damageResistances: m.damage_resistances || undefined,
    damageImmunities: m.damage_immunities || undefined,
    conditionImmunities: m.condition_immunities || undefined,
    senses: m.senses || undefined,
    languages: m.languages || undefined,
    challengeRating: m.challenge_rating,
    xp: CR_XP[m.challenge_rating] ?? undefined,
    traits: m.special_abilities?.map((a) => ({ name: a.name, description: a.desc })) ?? undefined,
    actions: m.actions?.map((a) => ({ name: a.name, description: a.desc })) ?? undefined,
    bonusActions: m.bonus_actions?.map((a) => ({ name: a.name, description: a.desc })) ?? undefined,
    reactions: m.reactions?.map((a) => ({ name: a.name, description: a.desc })) ?? undefined,
    legendaryActions: m.legendary_actions?.map((a) => ({ name: a.name, description: a.desc })) ?? undefined,
    creatureType,
    alignment: m.alignment || undefined,
    gameSystem: 'DND_5E',
  };

  // Remove undefined keys for clean JSON storage
  const cleanBlock = JSON.parse(JSON.stringify(statBlock));

  return {
    name: m.name,
    gameSystem: 'DND_5E' as const,
    source: 'srd',
    challengeRating: m.challenge_rating,
    creatureType,
    alignment: m.alignment || null,
    statBlock: cleanBlock,
    size: SIZE_MAP[m.size] || { width: 1, height: 1 },
    disposition: 'hostile',
    displayMode: 'pog',
  };
}

// ─── Fetch all SRD monsters from Open5e (paginated) ─────────────

/** The only host the seed fetches from, and the page it starts at. */
const OPEN5E_ORIGIN = 'https://api.open5e.com';
const FIRST_PAGE = `${OPEN5E_ORIGIN}/v1/monsters/?format=json&limit=50&document__slug=wotc-srd`;

/**
 * How long one page may take, from asking to the last byte. The SRD comes in
 * about seven pages of 50; a stalled upstream used to hold the seed, and
 * every other DM's, until the network gave up minutes later.
 */
export const SEED_PAGE_TIMEOUT_MS = 15_000;
/** The most pages followed. The SRD's 300-odd creatures are about seven. */
export const MAX_SEED_PAGES = 40;
/** A polite pause between pages. */
const PAGE_DELAY_MS = 200;

/** Open5e could not be read, or answered something the seed will not follow. Nothing was written. */
export class SeedSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedSourceError';
  }
}

export interface SeedOptions {
  /** The pause between pages; tests set 0. */
  pageDelayMs?: number;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/** One page of the monster list, read with a time limit, its shape checked. */
async function fetchPage(url: string): Promise<{ results: Open5eMonster[]; next: string | null }> {
  let data: unknown;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(SEED_PAGE_TIMEOUT_MS) });
    if (!response.ok) {
      throw new SeedSourceError(
        `api.open5e.com answered ${response.status} ${response.statusText}. Nothing was imported; try again later.`
      );
    }
    data = await response.json();
  } catch (error) {
    if (error instanceof SeedSourceError) throw error;
    throw new SeedSourceError(
      isTimeout(error)
        ? `api.open5e.com did not answer within ${SEED_PAGE_TIMEOUT_MS / 1000} seconds. Nothing was imported; check that this server can reach it, then try again.`
        : 'Could not reach api.open5e.com. Nothing was imported; check that this server can reach it, then try again.'
    );
  }
  const page = data as { results?: unknown; next?: unknown } | null;
  if (typeof page !== 'object' || page === null || !Array.isArray(page.results)) {
    throw new SeedSourceError('api.open5e.com answered with something that is not a list of creatures. Nothing was imported.');
  }
  const next = typeof page.next === 'string' && page.next !== '' ? page.next : null;
  return { results: page.results as Open5eMonster[], next };
}

/**
 * Every SRD monster Open5e lists, page by page. Only pages on Open5e's own
 * host are followed: the next page's address comes from the answer, and the
 * seed must not fetch whatever another host or a proxy put there.
 */
export async function fetchAllSrdMonsters(options: SeedOptions = {}): Promise<Open5eMonster[]> {
  const delay = options.pageDelayMs ?? PAGE_DELAY_MS;
  const all: Open5eMonster[] = [];
  let url: string | null = FIRST_PAGE;

  for (let pages = 0; url; pages++) {
    if (pages >= MAX_SEED_PAGES) {
      throw new SeedSourceError(
        `api.open5e.com listed more than ${MAX_SEED_PAGES} pages of SRD creatures, far more than the SRD holds, so nothing was imported.`
      );
    }
    const { results, next } = await fetchPage(url);
    all.push(...results);
    url = null;
    if (next) {
      let nextUrl: URL;
      try {
        nextUrl = new URL(next);
      } catch {
        throw new SeedSourceError('api.open5e.com gave a next page that is not an address. Nothing was imported.');
      }
      if (nextUrl.origin !== OPEN5E_ORIGIN) {
        throw new SeedSourceError(
          `api.open5e.com sent the next page to another site (${nextUrl.host}), which the import does not follow. Nothing was imported.`
        );
      }
      url = nextUrl.toString();
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }

  return all;
}

// ─── Public API ─────────────────────────────────────────────────

export interface SeedResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  alreadyExisted: number;
  /** Creatures whose stat block the Creature Library would refuse, so not stored. */
  rejected: number;
}

/**
 * One lock for every seed, the command-line script's and each backend
 * process's: held while the existing SRD creatures are read and the missing
 * ones written, so two seeds at once cannot both add the same creature. The
 * fetch from Open5e happens before it, so the lock is held for a moment.
 */
const SEED_LOCK_KEY = 703_118_2026;
/** Long enough for a second seed to wait out the first one's writes. */
const SEED_WRITE_TIMEOUT_MS = 120_000;

/**
 * Fill in hit points on a stat block that predates HP tracking.
 *
 * Returns null when the stat block already has HP (or is unusable), so callers
 * can skip the write. Only the HP keys are added — every other key is copied
 * through untouched, so a re-seed never rewrites curated stat block content.
 */
export function backfillStatBlockHp(
  existingStatBlock: unknown,
  hpMax: number,
  hitDice?: string
): Record<string, unknown> | null {
  if (!existingStatBlock || typeof existingStatBlock !== 'object' || Array.isArray(existingStatBlock)) {
    return null;
  }

  const statBlock = existingStatBlock as Record<string, unknown>;
  if (typeof statBlock.hpMax === 'number') {
    return null; // Already has HP — leave it alone
  }

  return {
    ...statBlock,
    hpMax,
    ...(hitDice && !statBlock.hitDice && { hitDice }),
  };
}

/**
 * Seed the CreatureTemplate table with D&D 5e SRD monsters from Open5e.
 * Safe to call multiple times — existing SRD creatures are skipped, except that
 * ones stored before hit points were tracked get their HP backfilled.
 * Custom creatures are never touched. Each creature's stat block is checked as
 * the Creature Library checks one it is given, and one that fails is left out.
 * Throws SeedSourceError, having written nothing, when Open5e cannot be read.
 */
export async function seedSrdCreatures(prisma: PrismaClient, options: SeedOptions = {}): Promise<SeedResult> {
  const monsters = await fetchAllSrdMonsters(options);

  // Made ready, and checked, before the lock is taken.
  let rejected = 0;
  const ready = new Map<string, { monster: Open5eMonster; data: ReturnType<typeof transformMonster> }>();
  for (const monster of monsters) {
    try {
      const data = transformMonster(monster);
      const checked = NpcStatBlockSchema.safeParse(data.statBlock);
      if (!checked.success) {
        rejected++;
        logger.warn(`Left out SRD creature "${monster.name}": ${checked.error.issues[0]?.message ?? 'invalid stat block'}`);
        continue;
      }
      if (!ready.has(data.name)) ready.set(data.name, { monster, data: { ...data, statBlock: checked.data } });
    } catch (err) {
      rejected++;
      logger.warn(`Left out SRD creature "${String(monster?.name)}": it could not be read`, { err });
    }
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<SeedResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SEED_LOCK_KEY})`;

    // Which SRD creatures already exist (and whether they carry HP)
    const existing = await tx.creatureTemplate.findMany({
      where: { source: 'srd' },
      select: { id: true, name: true, statBlock: true },
    });
    const existingByName = new Map(existing.map((e) => [e.name, e]));

    let updated = 0;
    let skipped = 0;
    const toCreate: Prisma.CreatureTemplateCreateManyInput[] = [];

    for (const { monster, data } of ready.values()) {
      const existingRow = existingByName.get(data.name);
      if (existingRow) {
        // Pre-HP row: add the missing hit points, leaving the rest as it was
        const patched = backfillStatBlockHp(existingRow.statBlock, monster.hit_points, monster.hit_dice);
        if (patched) {
          await tx.creatureTemplate.update({
            where: { id: existingRow.id },
            data: { statBlock: toJson(patched) },
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      toCreate.push({
        id: randomUUID(),
        name: data.name,
        gameSystem: data.gameSystem,
        source: data.source,
        challengeRating: data.challengeRating,
        creatureType: data.creatureType,
        alignment: data.alignment,
        imageUrl: null,
        statBlock: toJson(data.statBlock),
        size: toJson(data.size),
        disposition: data.disposition,
        displayMode: data.displayMode,
        createdById: null,
        campaignId: null,
      });
    }

    if (toCreate.length > 0) await tx.creatureTemplate.createMany({ data: toCreate });

    return {
      fetched: monsters.length,
      created: toCreate.length,
      updated,
      skipped,
      alreadyExisted: existingByName.size,
      rejected,
    };
  }, { timeout: SEED_WRITE_TIMEOUT_MS, maxWait: SEED_WRITE_TIMEOUT_MS });
}

/**
 * Check current SRD seed status without fetching from Open5e.
 *
 * The custom count covers what this campaign's library shows: creatures with
 * no campaign plus its own. Another campaign's homebrew is not counted, since
 * any member may ask.
 */
export async function getSrdSeedStatus(
  prisma: PrismaClient,
  campaignId: string,
): Promise<{ srdCount: number; customCount: number }> {
  const [srdCount, customCount] = await Promise.all([
    prisma.creatureTemplate.count({ where: { source: 'srd' } }),
    prisma.creatureTemplate.count({
      where: { source: 'custom', OR: [{ campaignId: null }, { campaignId }] },
    }),
  ]);
  return { srdCount, customCount };
}
