/**
 * rules/initiative.ts
 * How each supported game system determines initiative.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   frontend/src/utils/rules/initiative.ts
 *   backend/src/utils/rules/initiative.ts
 * ---------------------------------------------------------------------------
 * Same arrangement as rules/dnd5e.ts beside it: the frontend and backend are
 * separate TypeScript projects with no shared package, and a parity test in the
 * backend suite compares the two files and fails on any difference. Edit one,
 * copy it to the other.
 *
 * Both sides need this. The server decides what is actually rolled — it is the
 * only place that can, since it is the only place holding the character — while
 * the sheets and the roll menu need the same numbers to display. Deriving them
 * twice from one file is what keeps the shown value and the rolled value equal.
 *
 * Rules references, per system:
 *   D&D 5e   — Basic Rules, "Initiative": d20 + Dexterity modifier.
 *   PF2e     — initiative is a Perception check, or another skill the GM calls
 *              for (Stealth when sneaking up on someone, and so on).
 *   CoC 7e   — Keeper Rulebook, "Rank in DEX Order: Highest goes first."
 *              There is NO initiative roll. See the note on CALL_OF_CTHULHU_7E.
 *   SR6      — Initiative = (Reaction + Intuition) + initiative dice.
 */

import { abilityModifier, formatModifier } from './dnd5e';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * What initiative means for a particular combatant.
 *
 * Two shapes rather than one dice expression, because not every system rolls.
 * Call of Cthulhu orders combat by Dexterity with no die involved at all, and
 * squeezing that into an expression would mean inventing dice the rules do not
 * have — which is exactly the bug this module replaces.
 */
export type InitiativeResolution =
  | {
      kind: 'roll';
      /** Dice expression to evaluate, e.g. "1d20+3". */
      expression: string;
      /** Short human label for a menu or log, e.g. "1d20+3". */
      label: string;
    }
  | {
      kind: 'fixed';
      /** The initiative value itself. Nothing is rolled. */
      value: number;
      /** Short human label, e.g. "DEX 65". */
      label: string;
    };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Read a finite number from unknown data, or fall back. */
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Narrow unknown to an indexable record without trusting its shape.
 *
 * Values come back as `unknown` rather than `any`, so every read below has to
 * narrow before it can be used — which is the point. An `any` here would spread
 * silently through every caller and undo the checking this module exists to do.
 */
function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** A d20 roll with the given total modifier. */
function d20With(modifier: number): InitiativeResolution {
  const expression = `1d20${formatModifier(modifier)}`;
  return { kind: 'roll', expression, label: expression };
}

/**
 * Is this a plain "XdY" dice pool we can safely build an expression from?
 *
 * Shadowrun stores its initiative dice as free text, so it can hold anything a
 * user typed. Anything that is not a simple pool is rejected rather than
 * concatenated into an expression the dice parser would then throw on.
 */
function parseDicePool(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.replace(/\s+/g, '').match(/^(\d*)d(\d+)$/i);
  if (!match) return null;
  const count = match[1] === '' ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  if (!count || !sides || count > 100 || sides > 1000) return null;
  return `${count}d${sides}`;
}

// ---------------------------------------------------------------------------
// D&D 5e
// ---------------------------------------------------------------------------

/**
 * The total initiative modifier for a 5e character: Dexterity modifier plus
 * whatever `initiativeBonus` holds.
 *
 * The second half exists because Dexterity is not the whole story. The Alert
 * feat adds a flat +5; Jack of All Trades and Remarkable Athlete add part of the
 * proficiency bonus; some subclasses add Wisdom or Intelligence instead. Those
 * are too varied to derive from a sheet, so they live in one manual box and are
 * added here.
 *
 * `stats.dexterity.modifier` is kept in step with the score by the editor, but
 * it is recomputed here from the score when present so a stale stored modifier
 * cannot skew the roll.
 */
export function dnd5eInitiativeModifier(data: unknown): number {
  return dnd5eDexModifier(data) + dnd5eEffectiveInitiativeBonus(data);
}

/**
 * The Dexterity modifier a 5e sheet implies.
 *
 * Recomputed from the score where one is recorded, so a stored modifier that has
 * fallen out of step cannot skew the roll; the stored modifier is used only when
 * there is no score to work from.
 */
function dnd5eDexModifier(data: unknown): number {
  const dexRecord = rec(rec(rec(data)?.stats)?.dexterity);
  if (!dexRecord) return 0;
  return typeof dexRecord.score === 'number'
    ? abilityModifier(dexRecord.score)
    : num(dexRecord.modifier);
}

/**
 * The non-Dexterity bonus in force, including for a character saved before the
 * field existed.
 *
 * A sheet from before this was split carries only a hand-typed total. Reading
 * that total back as "Dexterity plus the rest" is what lets such a character
 * roll the number their sheet has always shown, without anyone having to open
 * and re-save it first. Without this the sheet would display one modifier and
 * the dice would use another — the exact split this module exists to close.
 */
function dnd5eEffectiveInitiativeBonus(data: unknown): number {
  const d = rec(data);
  if (!d) return 0;
  if (d.initiativeBonus !== undefined && d.initiativeBonus !== null) {
    return num(d.initiativeBonus);
  }
  // A stored zero is treated as "nothing was recorded", not as "the total is
  // zero". Blank sheets ship `initiative: 0` and the old field was typed by
  // hand, so a character who simply never filled it in would otherwise
  // back-derive to *minus* their Dexterity modifier and roll flat forever —
  // a Dexterity 16 character reading +0 instead of +3. Nothing is lost by the
  // reading: the old code ignored this field when rolling anyway, so there is
  // no previous roll behaviour to preserve, only the displayed number.
  if (typeof d.initiative === 'number' && Number.isFinite(d.initiative) && d.initiative !== 0) {
    return d.initiative - dnd5eDexModifier(d);
  }
  return 0;
}

/**
 * The "other bonus" implied by a character saved before `initiativeBonus`
 * existed, so their total does not change under them.
 *
 * Initiative used to be a single hand-typed number that nothing derived. A
 * player with the Alert feat and Dexterity 14 typed `7`. Now that the total is
 * derived, that same character has to come out at +7 rather than +2, so the
 * stored total is read back as "Dexterity plus five" — which is what it always
 * meant.
 *
 * Returns null when there is nothing to convert (the field already exists, or
 * no initiative was ever stored), so callers can leave the sheet alone.
 */
export function dnd5eBackfilledInitiativeBonus(data: unknown): number | null {
  const d = rec(data);
  if (!d) return null;
  if (d.initiativeBonus !== undefined && d.initiativeBonus !== null) return null;
  if (typeof d.initiative !== 'number' || !Number.isFinite(d.initiative)) return null;
  // See the note in dnd5eEffectiveInitiativeBonus: a stored zero means the
  // field was never filled in, so there is nothing to convert.
  if (d.initiative === 0) return null;

  // The same reading the roll already uses — this only reports it so the editor
  // can write it into the sheet and stop inferring it.
  return dnd5eEffectiveInitiativeBonus(d);
}

// ---------------------------------------------------------------------------
// Pathfinder 2e
// ---------------------------------------------------------------------------

/**
 * The initiative bonus for a PF2e character.
 *
 * Initiative is a Perception check by default, but the GM can call for a skill
 * instead — Stealth to sneak up on someone, Deception to feint. The sheet
 * records that choice in `initiative.usedStat`, so the bonus is simply whichever
 * stat is named. Nothing here is a separate number to be kept in step; that was
 * the previous bug, where a `bonus` field was displayed but never calculated and
 * so read +0 for every character ever made.
 */
export function pf2eInitiativeBonus(data: unknown): number {
  const d = rec(data);
  if (!d) return 0;

  const usedStat = typeof rec(d.initiative)?.usedStat === 'string'
    ? String(rec(d.initiative)!.usedStat)
    : 'perception';

  if (usedStat === 'perception') return num(rec(d.perception)?.bonus);

  const skill = rec(rec(d.skills)?.[usedStat]);
  if (skill) return num(skill.bonus);

  // A lore skill, or a name the sheet no longer offers — fall back to
  // Perception, which is the system default, rather than silently rolling flat.
  return num(rec(d.perception)?.bonus);
}

// ---------------------------------------------------------------------------
// Call of Cthulhu 7e
// ---------------------------------------------------------------------------

/** An investigator's DEX, which is their place in the order. */
function cocDexterity(data: unknown): number {
  const characteristics = rec(rec(data)?.characteristics);
  if (!characteristics) return 0;
  const dex = rec(characteristics.DEX) ?? rec(characteristics.dex);
  return num(dex?.regular);
}

// ---------------------------------------------------------------------------
// Public resolution
// ---------------------------------------------------------------------------

/**
 * How initiative should be determined for a player character.
 *
 * Returns null for a system with no initiative rule we can apply (including
 * Flexible/custom sheets), which callers should treat as "fall back to a plain
 * d20" rather than an error.
 */
export function resolveCharacterInitiative(
  gameSystem: string | null | undefined,
  data: unknown
): InitiativeResolution | null {
  if (!data) return null;

  switch (gameSystem) {
    case 'DND_5E':
      return d20With(dnd5eInitiativeModifier(data));

    case 'PATHFINDER_2E':
      return d20With(pf2eInitiativeBonus(data));

    case 'CALL_OF_CTHULHU_7E': {
      // Deliberately not a roll. Call of Cthulhu ranks combatants in DEX order,
      // highest first — there is no initiative die in the game. (A readied
      // firearm acts at DEX + 50, but that is a property of the round rather
      // than of the investigator, so the Keeper applies it by hand.)
      const dex = cocDexterity(data);
      return { kind: 'fixed', value: dex, label: `DEX ${dex}` };
    }

    case 'SHADOWRUN_6E': {
      const meat = rec(rec(rec(data)?.derivedStats)?.initiative)?.meatspace;
      const pool = parseDicePool(rec(meat)?.dicePools);
      if (!pool) return null;
      const base = num(rec(meat)?.base);
      const expression = `${pool}${formatModifier(base)}`;
      return { kind: 'roll', expression, label: expression };
    }

    default:
      return null;
  }
}

/**
 * How initiative should be determined for an NPC token, from its stat block.
 *
 * Only D&D 5e stat blocks carry enough structure to derive this — abilities are
 * stored as raw scores keyed by `dex`. Everything else returns null and rolls a
 * plain d20, which is what a stat block without recorded ability scores can
 * honestly support.
 */
export function resolveStatBlockInitiative(
  gameSystem: string | null | undefined,
  statBlock: unknown
): InitiativeResolution | null {
  if (gameSystem !== 'DND_5E') return null;
  const abilities = rec(rec(statBlock)?.abilities);
  if (!abilities || typeof abilities.dex !== 'number') return null;
  return d20With(abilityModifier(abilities.dex));
}

/** The expression a caller should use when nothing system-specific applies. */
export const DEFAULT_INITIATIVE_EXPRESSION = '1d20';
