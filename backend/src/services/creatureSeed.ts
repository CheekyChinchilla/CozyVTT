/**
 * creatureSeed.ts
 * Service that fetches D&D 5e SRD monsters from Open5e API and seeds the
 * CreatureTemplate table. Used by both the CLI script and the API endpoint.
 *
 * SRD content is used under the Open Game License v1.0a.
 * See OGL_ATTRIBUTION.md for details.
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
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

interface Open5eResponse {
  count: number;
  next: string | null;
  results: Open5eMonster[];
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

function transformMonster(m: Open5eMonster) {
  const speedParts = Object.entries(m.speed)
    .map(([type, val]) => (type === 'walk' ? `${val} ft.` : `${type} ${val} ft.`));
  const speedStr = speedParts.join(', ') || '0 ft.';

  const savingThrows: Record<string, number> = {};
  if (m.strength_save !== null) savingThrows.str = m.strength_save;
  if (m.dexterity_save !== null) savingThrows.dex = m.dexterity_save;
  if (m.constitution_save !== null) savingThrows.con = m.constitution_save;
  if (m.intelligence_save !== null) savingThrows.int = m.intelligence_save;
  if (m.wisdom_save !== null) savingThrows.wis = m.wisdom_save;
  if (m.charisma_save !== null) savingThrows.cha = m.charisma_save;

  const creatureType = m.subtype
    ? `${m.size} ${m.type} (${m.subtype})`
    : `${m.size} ${m.type}`;

  const statBlock = {
    ac: m.armor_class,
    speed: speedStr,
    abilities: {
      str: m.strength, dex: m.dexterity, con: m.constitution,
      int: m.intelligence, wis: m.wisdom, cha: m.charisma,
    },
    savingThrows: Object.keys(savingThrows).length > 0 ? savingThrows : undefined,
    skills: m.skills && Object.keys(m.skills).length > 0 ? m.skills : undefined,
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

async function fetchAllSrdMonsters(): Promise<Open5eMonster[]> {
  const all: Open5eMonster[] = [];
  let url: string | null = 'https://api.open5e.com/v1/monsters/?format=json&limit=50&document__slug=wotc-srd';

  while (url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open5e API error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as Open5eResponse;
    all.push(...data.results);
    url = data.next;
    // Polite delay between pages
    await new Promise((r) => setTimeout(r, 200));
  }

  return all;
}

// ─── Public API ─────────────────────────────────────────────────

export interface SeedResult {
  fetched: number;
  created: number;
  skipped: number;
  alreadyExisted: number;
}

/**
 * Seed the CreatureTemplate table with D&D 5e SRD monsters from Open5e.
 * Safe to call multiple times — skips existing SRD creatures by name.
 */
export async function seedSrdCreatures(prisma: PrismaClient): Promise<SeedResult> {
  // Check how many SRD creatures already exist
  const existing = await prisma.creatureTemplate.findMany({
    where: { source: 'srd' },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((e) => e.name));

  // Fetch from Open5e
  const monsters = await fetchAllSrdMonsters();

  let created = 0;
  let skipped = 0;

  for (const monster of monsters) {
    if (existingNames.has(monster.name)) {
      skipped++;
      continue;
    }

    const data = transformMonster(monster);
    try {
      await prisma.creatureTemplate.create({
        data: {
          id: randomUUID(),
          name: data.name,
          gameSystem: data.gameSystem,
          source: data.source,
          challengeRating: data.challengeRating,
          creatureType: data.creatureType,
          alignment: data.alignment,
          imageUrl: null,
          statBlock: data.statBlock,
          size: data.size,
          disposition: data.disposition,
          displayMode: data.displayMode,
          createdById: null,
          campaignId: null,
        },
      });
      created++;
    } catch (err) {
      // Log but don't abort — skip problematic entries
      logger.error(`Failed to insert "${monster.name}"`, { err: err });
    }
  }

  return {
    fetched: monsters.length,
    created,
    skipped,
    alreadyExisted: existingNames.size,
  };
}

/**
 * Check current SRD seed status without fetching from Open5e.
 */
export async function getSrdSeedStatus(prisma: PrismaClient): Promise<{ srdCount: number; customCount: number }> {
  const [srdCount, customCount] = await Promise.all([
    prisma.creatureTemplate.count({ where: { source: 'srd' } }),
    prisma.creatureTemplate.count({ where: { source: 'custom' } }),
  ]);
  return { srdCount, customCount };
}
