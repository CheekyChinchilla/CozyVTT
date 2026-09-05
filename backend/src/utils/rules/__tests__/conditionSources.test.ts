/**
 * One list of D&D 5e conditions, not several.
 *
 * The set was written down twice: the character sheet offered all fifteen, the
 * token editor a hand-picked twelve. They drifted, and a DM could not mark an
 * NPC Deafened, Grappled or Petrified even though a player character could be.
 * The test that was meant to catch this compared each list against the
 * abbreviation table separately — and twelve of fifteen is still "every offered
 * condition has a code", so it passed while the editors disagreed.
 *
 * This checks the shape of the fix rather than its contents: no component may
 * declare its own condition array, because a single shared export is what makes
 * the divergence impossible rather than merely absent today. It lives in the
 * backend suite for the same reason the rules parity check does — this project
 * has @types/node, and the browser project does not.
 */
import { readFileSync } from 'fs';
import path from 'path';

const FRONTEND = path.resolve(__dirname, '../../../../../frontend/src');

/** Files that render a condition picker and must import the shared list. */
const CONDITION_CONSUMERS = [
  'components/campaign/NpcQuickEditor.tsx',
  'components/character-sheets/dnd5e/DnD5eCharacterEditor.tsx',
];

/**
 * A local condition list: an array literal holding several of the fifteen
 * names. Deliberately loose — it is looking for the shape of a hand-rolled
 * list, not one exact spelling of it.
 */
function declaresOwnConditionList(source: string): boolean {
  const arrays = source.match(/\[[^[\]]*\]/gs) ?? [];
  return arrays.some((literal) => {
    const names = literal.match(
      /'(Blinded|Charmed|Deafened|Exhausted|Frightened|Grappled|Incapacitated|Invisible|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|Unconscious)'/g
    );
    return (names?.length ?? 0) >= 3;
  });
}

describe('D&D 5e conditions have a single source', () => {
  it.each(CONDITION_CONSUMERS)('%s does not declare its own list', (file) => {
    const source = readFileSync(path.join(FRONTEND, file), 'utf8');
    expect(declaresOwnConditionList(source)).toBe(false);
  });

  it.each(CONDITION_CONSUMERS)('%s imports DND5E_CONDITIONS', (file) => {
    const source = readFileSync(path.join(FRONTEND, file), 'utf8');
    expect(source).toMatch(/DND5E_CONDITIONS/);
  });

  it('the shared list holds all fifteen conditions', () => {
    const source = readFileSync(path.join(FRONTEND, 'utils/conditions.ts'), 'utf8');
    const block = source.slice(source.indexOf('DND5E_CONDITIONS'));
    const listed = (block.slice(0, block.indexOf('];')).match(/'([A-Z][a-z]+)'/g) ?? [])
      .map((s) => s.replace(/'/g, ''));
    expect(listed.sort()).toEqual([
      'Blinded', 'Charmed', 'Deafened', 'Exhausted', 'Frightened', 'Grappled',
      'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned',
      'Prone', 'Restrained', 'Stunned', 'Unconscious',
    ].sort());
  });
});
