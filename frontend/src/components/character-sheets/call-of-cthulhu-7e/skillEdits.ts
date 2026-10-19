/**
 * Writing one field of one Call of Cthulhu skill.
 *
 * Most skills sit at the top of `skills`, but some are grouped: Brawl under
 * `fighting`, the three firearms under `firearms`, the specialisations a
 * player adds in lists inside those (`fighting.custom.0`), and other
 * languages, sciences and custom skills in lists. SkillsList names a row by its place,
 * `fighting.brawl` or `science.2`, and the edit has to land there. Written
 * under that name as a flat key, it reached nothing that reads the skill and
 * the server dropped it.
 */

import type { CoC7eSkills } from '@/types/game-systems';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The skills with `field` of the skill at `path` set to `value`. A path that
 * names no skill on the sheet leaves the skills as they are.
 */
export function setCoC7eSkillField(
  skills: Partial<CoC7eSkills>,
  path: string,
  field: string,
  value: unknown
): Partial<CoC7eSkills> {
  const next = setAt(skills, path.split('.'), field, value);
  return next === undefined ? skills : (next as Partial<CoC7eSkills>);
}

/**
 * `container` with `field` set on the entry `keys` leads to, copying each level
 * on the way down: `fighting.custom.1` is a list inside a group. Undefined when
 * the keys lead to nothing on the sheet.
 */
function setAt(container: unknown, keys: string[], field: string, value: unknown): unknown {
  if (keys.length === 0) return { ...asRecord(container), [field]: value };
  const [key, ...rest] = keys;
  if (Array.isArray(container)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= container.length) return undefined;
    const entry = setAt(container[index], rest, field, value);
    if (entry === undefined) return undefined;
    const list = [...container];
    list[index] = entry;
    return list;
  }
  const record = asRecord(container);
  if (!(key in record)) return undefined;
  const entry = setAt(record[key], rest, field, value);
  return entry === undefined ? undefined : { ...record, [key]: entry };
}

/** The lists of skills a player adds to and removes from. */
export type CoC7eSkillList = 'fighting.custom' | 'firearms.custom' | 'languageOther' | 'science' | 'customSkills';

/** The entries of one list, empty when the sheet has none. */
export function readCoC7eSkillList(skills: Partial<CoC7eSkills>, list: CoC7eSkillList): Record<string, unknown>[] {
  const [group, member] = list.split('.');
  const container = (skills as Record<string, unknown>)[group];
  const entries = member ? asRecord(container)[member] : container;
  return Array.isArray(entries) ? (entries as Record<string, unknown>[]) : [];
}

/** The skills with one list replaced, its group kept around it. */
export function withCoC7eSkillList(
  skills: Partial<CoC7eSkills>,
  list: CoC7eSkillList,
  entries: Record<string, unknown>[]
): Partial<CoC7eSkills> {
  const [group, member] = list.split('.');
  const source = skills as Record<string, unknown>;
  const next = member ? { ...asRecord(source[group]), [member]: entries } : entries;
  return { ...source, [group]: next } as Partial<CoC7eSkills>;
}
