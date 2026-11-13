// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * rules/initiative.ts
 * How each supported game system determines initiative.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   frontend/src/utils/rules/initiative.ts
 *   backend/src/utils/rules/initiative.ts
 * ---------------------------------------------------------------------------
 * Same arrangement as rules/fifthEdition.ts beside it: the frontend and backend are
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
 *   5E          — SRD 5.1, "Initiative": d20 + Dexterity modifier.
 *                 With advantage, two d20s and the higher kept; advantage and
 *                 disadvantage together cancel to one d20.
 *   Fantasy d20 — initiative is a Perception check, or another skill the GM
 *                 calls for (Stealth when sneaking up on someone, and so on).
 *   Horror d100 — combatants act in DEX order, highest first.
 *                 There is NO initiative roll. See the note on HORROR_D100.
 */

import { abilityModifier, exhaustionLevel, formatModifier } from './fifthEdition';
import { fantasyD20PerceptionTotal, fantasyD20SkillTotal } from './fantasyD20';
import { normaliseGameSystem } from '../../legacy/gameSystemAliases';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * What initiative means for a particular combatant.
 *
 * Two shapes rather than one dice expression, because not every system rolls.
 * Horror d100 orders combat by Dexterity with no die involved at all, and
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
      /** Short human label, e.g. "DEX 13". */
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

/** A d20 roll with the given total modifier, two d20s keeping the higher with advantage. */
function d20With(modifier: number, advantage = false): InitiativeResolution {
  const expression = `${advantage ? '2d20kh1' : '1d20'}${formatModifier(modifier)}`;
  return { kind: 'roll', expression, label: expression };
}

// ---------------------------------------------------------------------------
// 5E
// ---------------------------------------------------------------------------

/**
 * The total initiative modifier for a 5E character: Dexterity modifier plus
 * whatever `initiativeBonus` holds.
 *
 * The second half exists because Dexterity is not the whole story. A feat can
 * add a flat +5; Jack of All Trades and Remarkable Athlete add part of the
 * proficiency bonus; some subclasses add Wisdom or Intelligence instead. Those
 * are too varied to derive from a sheet, so they live in one manual box and are
 * added here.
 *
 * `stats.dexterity.modifier` is kept in step with the score by the editor, but
 * it is recomputed here from the score when present so a stale stored modifier
 * cannot skew the roll.
 */
export function fifthEditionInitiativeModifier(data: unknown): number {
  return fifthEditionDexModifier(data) + fifthEditionEffectiveInitiativeBonus(data);
}

/**
 * The Dexterity modifier a 5E sheet implies.
 *
 * Recomputed from the score where one is recorded, so a stored modifier that has
 * fallen out of step cannot skew the roll; the stored modifier is used only when
 * there is no score to work from.
 */
function fifthEditionDexModifier(data: unknown): number {
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
function fifthEditionEffectiveInitiativeBonus(data: unknown): number {
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
    return d.initiative - fifthEditionDexModifier(d);
  }
  return 0;
}

/**
 * The "other bonus" implied by a character saved before `initiativeBonus`
 * existed, so their total does not change under them.
 *
 * Initiative used to be a single hand-typed number that nothing derived. A
 * player with a feat worth +5 and Dexterity 14 typed `7`. Now that the total is
 * derived, that same character has to come out at +7 rather than +2, so the
 * stored total is read back as "Dexterity plus five" — which is what it always
 * meant.
 *
 * Returns null when there is nothing to convert (the field already exists, or
 * no initiative was ever stored), so callers can leave the sheet alone.
 */
export function fifthEditionBackfilledInitiativeBonus(data: unknown): number | null {
  const d = rec(data);
  if (!d) return null;
  if (d.initiativeBonus !== undefined && d.initiativeBonus !== null) return null;
  if (typeof d.initiative !== 'number' || !Number.isFinite(d.initiative)) return null;
  // See the note in fifthEditionEffectiveInitiativeBonus: a stored zero means the
  // field was never filled in, so there is nothing to convert.
  if (d.initiative === 0) return null;

  // The same reading the roll already uses — this only reports it so the editor
  // can write it into the sheet and stop inferring it.
  return fifthEditionEffectiveInitiativeBonus(d);
}

/**
 * Conditions a 5E sheet can record that give disadvantage on every ability
 * check, and so on initiative, which is a Dexterity check. Named in lower case,
 * as the sheet's condition boxes write them, and matched in any case.
 *
 * `exhausted` is no longer one of the boxes: the sheet records exhaustion as a
 * level. A sheet saved before exhaustion had levels (before 1.3.0) can still
 * hold it as a condition, with no level beside it, and that is at least one
 * level.
 *
 * Only the ones that always apply. Frightened gives disadvantage only while the
 * source of the fear is in sight, which a sheet cannot tell, so it is left to
 * the GM, who can set anyone's initiative by hand.
 */
export const FIFTH_EDITION_CHECK_DISADVANTAGE_CONDITIONS: readonly string[] = ['poisoned', 'exhausted'];

/**
 * Whether a 5E character rolls initiative with advantage:
 *
 * - `advantage`: the sheet's box is ticked, and nothing on the sheet gives
 *   disadvantage on the roll.
 * - `cancelled`: the box is ticked, but a level of exhaustion or one of the
 *   conditions above gives disadvantage on the roll. Advantage and
 *   disadvantage together cancel to one d20, however many of each there are.
 * - `none`: the box is not ticked, or the sheet is from before it existed.
 *
 * Exhaustion and conditions give no disadvantage of their own here. No roll
 * from a sheet applies them, so they only cancel a box the player ticked.
 */
export type FifthEditionInitiativeAdvantage = 'advantage' | 'cancelled' | 'none';

export function fifthEditionInitiativeAdvantage(data: unknown): FifthEditionInitiativeAdvantage {
  const d = rec(data);
  if (d?.initiativeAdvantage !== true) return 'none';
  return fifthEditionHasCheckDisadvantage(d) ? 'cancelled' : 'advantage';
}

/** Whether a 5E sheet records something that gives disadvantage on every ability check. */
function fifthEditionHasCheckDisadvantage(d: Record<string, unknown>): boolean {
  if (exhaustionLevel(d.exhaustionLevel) > 0) return true;
  return Array.isArray(d.conditions) && d.conditions.some(
    (condition) => typeof condition === 'string'
      && FIFTH_EDITION_CHECK_DISADVANTAGE_CONDITIONS.includes(condition.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// Fantasy d20
// ---------------------------------------------------------------------------

/**
 * The initiative bonus for a Fantasy d20 character.
 *
 * Initiative is a Perception check by default, but the GM can call for a skill
 * instead — Stealth to sneak up on someone, Deception to feint. The sheet
 * records that choice in `initiative.usedStat`, so the bonus is simply whichever
 * stat is named. Nothing here is a separate number to be kept in step; that was
 * the previous bug, where a `bonus` field was displayed but never calculated and
 * so read +0 for every character ever made. The stat's total is worked out from
 * its parts, as the sheet shows it, not read from what was last stored.
 */
export function fantasyD20InitiativeBonus(data: unknown): number {
  const d = rec(data);
  if (!d) return 0;

  const usedStat = typeof rec(d.initiative)?.usedStat === 'string'
    ? String(rec(d.initiative)!.usedStat)
    : 'perception';

  if (usedStat === 'perception') return fantasyD20PerceptionTotal(d);

  const skill = rec(rec(d.skills)?.[usedStat]);
  if (skill) return fantasyD20SkillTotal(d, skill);

  // A lore skill, or a name the sheet no longer offers — fall back to
  // Perception, which is the system default, rather than silently rolling flat.
  return fantasyD20PerceptionTotal(d);
}

// ---------------------------------------------------------------------------
// Horror d100
// ---------------------------------------------------------------------------

/** A character's DEX, which is their place in the order. */
function horrorD100Dexterity(data: unknown): number {
  return num(rec(rec(data)?.characteristics)?.DEX);
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
    case 'FIFTH_EDITION':
      return d20With(fifthEditionInitiativeModifier(data), fifthEditionInitiativeAdvantage(data) === 'advantage');

    case 'FANTASY_D20':
      return d20With(fantasyD20InitiativeBonus(data));

    case 'HORROR_D100': {
      // Not a roll. Horror d100 ranks combatants in DEX order, highest
      // first: the rules have no initiative die. (Whatever moves a
      // character's place in one round belongs to the round and not to the
      // character, so the GM applies it by hand: a spell is cast one DEX rank
      // later for each of its levels; open d100 rules, p. 57, Casting Time.)
      const dex = horrorD100Dexterity(data);
      return { kind: 'fixed', value: dex, label: `DEX ${dex}` };
    }

    default:
      return null;
  }
}

/**
 * How initiative should be determined for an NPC token, from its stat block.
 *
 * Only 5E stat blocks carry enough structure to derive this — abilities are
 * stored as raw scores keyed by `dex`. Everything else returns null and rolls a
 * plain d20, which is what a stat block without recorded ability scores can
 * honestly support.
 *
 * So does a stat block labelled with a game system other than the campaign's:
 * its scores are on that system's scale, and a Horror d100 DEX of 80 read
 * as a 5E score would be +35. A label an older version wrote names its
 * system as the new one does (legacy/gameSystemAliases.ts).
 */
export function resolveStatBlockInitiative(
  gameSystem: string | null | undefined,
  statBlock: unknown
): InitiativeResolution | null {
  if (gameSystem !== 'FIFTH_EDITION') return null;
  const block = rec(statBlock);
  const label = block?.gameSystem;
  if (typeof label === 'string' && label !== '' && (normaliseGameSystem(label) ?? label) !== gameSystem) {
    return null;
  }
  const abilities = rec(block?.abilities);
  if (!abilities || typeof abilities.dex !== 'number') return null;
  return d20With(abilityModifier(abilities.dex));
}

/** The expression a caller should use when nothing system-specific applies. */
export const DEFAULT_INITIATIVE_EXPRESSION = '1d20';
