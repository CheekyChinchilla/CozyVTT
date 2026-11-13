/**
 * Every 5E effect the token editor offers is in the SRD 5.1.
 *
 * The list lives in the frontend (`FIFTH_EDITION_EFFECTS` in
 * `frontend/src/utils/conditions.ts`), so this reads it there and holds each
 * name to SRD_TOKEN_EFFECTS, which records where the SRD 5.1 has it. A new
 * effect is offered once its source is recorded there.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { SRD_TOKEN_EFFECTS } from './helpers/openContentNames';

const CONDITIONS = path.resolve(__dirname, '../../..', 'frontend/src/utils/conditions.ts');

/** The names in `FIFTH_EDITION_EFFECTS`, as the frontend writes them. */
function offeredEffects(): string[] {
  const block = /export const FIFTH_EDITION_EFFECTS[^=]*=\s*\[([^\]]*)\]/.exec(readFileSync(CONDITIONS, 'utf8'));
  if (!block) throw new Error('FIFTH_EDITION_EFFECTS moved; update this test');
  return [...block[1].matchAll(/(['"])(.*?)\1/g)].map((match) => match[2]);
}

describe("the token editor's 5E effects", () => {
  it('are read from the frontend list', () => {
    expect(offeredEffects().length).toBeGreaterThan(0);
  });

  it('are each in the SRD 5.1, with the source recorded', () => {
    expect(offeredEffects().filter((name) => !SRD_TOKEN_EFFECTS.has(name))).toEqual([]);
  });

  // The list holds the effects offered, each with its source.
  it('have no source recorded for an effect the list no longer offers', () => {
    const offered = new Set(offeredEffects());
    expect([...SRD_TOKEN_EFFECTS.keys()].filter((name) => !offered.has(name))).toEqual([]);
  });
});
