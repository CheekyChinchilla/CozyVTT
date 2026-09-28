import { TokenDisposition, type CreatureTemplate } from '@/types';

const KNOWN: readonly string[] = Object.values(TokenDisposition);

/**
 * A creature template as the client types it, whatever the row holds.
 *
 * The database column is free text. New templates are checked, but one
 * imported by an earlier release could hold any short string ("Hostile",
 * say), and CreatureTemplate.disposition claims one of three values. Read
 * through this, the claim is true: an unknown value becomes hostile, the
 * default the importer has always used, and the creature can be placed.
 */
export function withKnownDisposition<T extends Pick<CreatureTemplate, 'disposition'>>(creature: T): T {
  const value: unknown = creature.disposition;
  return typeof value === 'string' && KNOWN.includes(value)
    ? creature
    : { ...creature, disposition: TokenDisposition.HOSTILE };
}
