/**
 * Writing one field of one Call of Cthulhu skill.
 *
 * Most skills sit at the top of `skills`, but some are grouped: Brawl under
 * `fighting`, the three firearms under `firearms`, and other languages,
 * sciences and custom skills in lists. SkillsList names a row by its place,
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
  const source = skills as Record<string, unknown>;
  const dot = path.indexOf('.');
  const group = dot === -1 ? path : path.slice(0, dot);
  const member = dot === -1 ? null : path.slice(dot + 1);
  const container = source[group];

  let next: unknown;
  if (member === null) {
    next = { ...asRecord(container), [field]: value };
  } else if (Array.isArray(container)) {
    const index = Number(member);
    if (!Number.isInteger(index) || index < 0 || index >= container.length) return skills;
    const list = [...container];
    list[index] = { ...asRecord(list[index]), [field]: value };
    next = list;
  } else {
    const members = asRecord(container);
    if (!(member in members)) return skills;
    next = { ...members, [member]: { ...asRecord(members[member]), [field]: value } };
  }

  return { ...source, [group]: next } as Partial<CoC7eSkills>;
}
