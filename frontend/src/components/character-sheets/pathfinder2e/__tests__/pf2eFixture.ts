/**
 * A Pathfinder 2e character for editor tests: the blank built-in template,
 * which the server accepts as it stands, with the parts under test overridden.
 */

import type { Character } from '../../../../types';

export const PF2E_BLANK_SHEET: Record<string, unknown> = {
  characterName: "New Character",
  ancestry: "Human",
  heritage: "Versatile Heritage",
  class: "Fighter",
  level: 1,
  attributes: {
    "strength": {"score": 10, "modifier": 0},
    "dexterity": {"score": 10, "modifier": 0},
    "constitution": {"score": 10, "modifier": 0},
    "intelligence": {"score": 10, "modifier": 0},
    "wisdom": {"score": 10, "modifier": 0},
    "charisma": {"score": 10, "modifier": 0},
  },
  hp: {
    "maximum": 10,
    "ancestryHp": 0,
    "classHpPerLevel": 0,
    "current": 10,
    "temporary": 0,
    "resistances": [],
    "immunities": [],
    "weaknesses": [],
  },
  armorClass: {"total": 10, "proficiencyRank": "untrained", "capDex": null, "itemBonus": 0, "armorPenalty": 0},
  savingThrows: {
    "fortitude": {"proficiencyRank": "untrained", "itemBonus": 0, "bonus": 0},
    "reflex": {"proficiencyRank": "untrained", "itemBonus": 0, "bonus": 0},
    "will": {"proficiencyRank": "untrained", "itemBonus": 0, "bonus": 0},
  },
  perception: {"proficiencyRank": "untrained", "itemBonus": 0, "bonus": 0, "senses": []},
  classDC: {"total": 10, "keyAttribute": "str", "proficiencyRank": "untrained"},
  speed: {"land": 25, "other": []},
  strikes: [],
  skills: {
    "acrobatics": {"attribute": "dex", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "arcana": {"attribute": "int", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "athletics": {"attribute": "str", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "crafting": {"attribute": "int", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "deception": {"attribute": "cha", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "diplomacy": {"attribute": "cha", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "intimidation": {"attribute": "cha", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "medicine": {"attribute": "wis", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "nature": {"attribute": "wis", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "occultism": {"attribute": "int", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "performance": {"attribute": "cha", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "religion": {"attribute": "wis", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "society": {"attribute": "int", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "stealth": {"attribute": "dex", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "survival": {"attribute": "wis", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
    "thievery": {"attribute": "dex", "proficiencyRank": "untrained", "armorPenalty": 0, "itemBonus": 0, "bonus": 0},
  },
  feats: {"ancestryAndHeritage": [], "class": [], "skill": [], "general": [], "bonus": []},
  inventory: [],
  bulk: {"current": 0, "encumbered": 5, "maximum": 10},
  currency: {"cp": 0, "sp": 0, "gp": 0, "pp": 0},
  spellcasting: {
    "tradition": "Arcane",
    "type": "Prepared",
    "keyAttribute": "int",
    "spellAttackBonus": {"proficiencyRank": "untrained", "itemBonus": 0, "bonus": 0},
    "spellDC": {"proficiencyRank": "untrained", "itemBonus": 0, "dc": 10},
    "cantrips": [],
    "slots": {"1": {"total": 0, "expended": 0}, "2": {"total": 0, "expended": 0}, "3": {"total": 0, "expended": 0}, "4": {"total": 0, "expended": 0}, "5": {"total": 0, "expended": 0}, "6": {"total": 0, "expended": 0}, "7": {"total": 0, "expended": 0}, "8": {"total": 0, "expended": 0}, "9": {"total": 0, "expended": 0}, "10": {"total": 0, "expended": 0}},
    "spells": [],
    "focusSpells": {"focusPoints": {"total": 0, "current": 0}, "spells": []},
    "innateSpells": [],
    "rituals": [],
  },
  languages: ["Common"],
  conditions: [],
  notes: "",
};

export function pf2eCharacter(overrides: Record<string, unknown> = {}): Character {
  const data: Record<string, unknown> = JSON.parse(JSON.stringify(PF2E_BLANK_SHEET));
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'New Character',
    gameSystem: 'PATHFINDER_2E',
    campaignId: null,
    tokenImageUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    data: { ...data, ...overrides },
  } as unknown as Character;
}
