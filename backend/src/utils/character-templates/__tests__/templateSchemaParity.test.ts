/**
 * The built-in templates must write the fields the schema declares.
 *
 * They did not. Each was written against an older shape and never caught up, so
 * it seeded fields nothing reads while leaving the declared ones empty. Because
 * `PUT /characters/:id` stores the body as sent rather than Zod's parsed
 * output, the undeclared fields were saved happily and then ignored by every
 * reader. What a player saw was a Fighter with a blank Features tab while
 * "Second Wind" sat in the database, and a Pathfinder sheet reading "No
 * strikes/attacks recorded" with a warhammer and a crossbow stored on it.
 *
 * Validating a template proves it is *acceptable*. It cannot prove the template
 * is not also carrying a field the schema quietly ignores — Zod strips unknown
 * keys rather than complaining. That gap is what these close.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { validateCharacterData } from '../../../validators/game-systems';
import { GameSystem } from '../../../game-systems';
import { getTemplatesForGameSystem } from '../index';
import { pf2eArmorClass, pf2eClassDC } from '../../rules/pathfinder2e';

/** Top-level keys of a Zod object schema, read from its source. */
function schemaKeys(file: string, marker: string): Set<string> {
  const src = readFileSync(
    path.resolve(__dirname, '../../../validators/game-systems', file),
    'utf8'
  );
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`schema marker not found in ${file}: ${marker}`);
  const body = src.slice(start);
  const declared = body.slice(0, body.indexOf('\n});')).match(/^ {2}(\w+):/gm) ?? [];
  return new Set(declared.map((line) => line.trim().replace(':', '')));
}

const SYSTEMS: { system: GameSystem; file: string; marker: string }[] = [
  { system: GameSystem.DND_5E, file: 'dnd5e.schema.ts', marker: 'dnd5eCharacterDataSchema = z.object({' },
  { system: GameSystem.PATHFINDER_2E, file: 'pathfinder2e.schema.ts', marker: 'pathfinder2eCharacterDataSchema = z.object({' },
  { system: GameSystem.CALL_OF_CTHULHU_7E, file: 'callOfCthulhu7e.schema.ts', marker: 'callOfCthulhu7eCharacterDataSchema = z.object({' },
  { system: GameSystem.SHADOWRUN_6E, file: 'shadowrun6e.schema.ts', marker: 'shadowrun6eCharacterDataSchema = z.object({' },
];

describe('built-in templates match their schema', () => {
  for (const { system, file, marker } of SYSTEMS) {
    describe(system, () => {
      const declared = schemaKeys(file, marker);
      const templates = getTemplatesForGameSystem(system);

      it('has templates to check', () => {
        expect(templates.length).toBeGreaterThan(0);
      });

      for (const template of templates) {
        it(`${template.name} writes only declared fields`, () => {
          const undeclared = Object.keys(template.data).filter((key) => !declared.has(key));
          expect(undeclared).toEqual([]);
        });

        it(`${template.name} validates`, () => {
          const result = validateCharacterData(system, template.data);
          if (!result.success) {
            throw new Error(
              `${system} / ${template.name} failed validation: ` +
                JSON.stringify(result.errors.issues.slice(0, 4))
            );
          }
          expect(result.success).toBe(true);
        });
      }
    });
  }
});

/**
 * A template must not ship a derived total that contradicts the components it
 * stores alongside it.
 *
 * The Level 1 Fighter shipped Armor Class 18 and Class DC 17, each one higher
 * than its own recorded proficiency rank, item bonus and attribute give. The
 * read-only sheet printed the stored number, so those were what a player saw.
 */
describe('Pathfinder 2e templates agree with the rules maths', () => {
  for (const template of getTemplatesForGameSystem(GameSystem.PATHFINDER_2E)) {
    const data = template.data as Record<string, unknown>;

    it(`${template.name} stores the Armor Class its own components give`, () => {
      const stored = (data.armorClass as { total?: number } | undefined)?.total;
      if (stored === undefined) return;
      expect(stored).toBe(pf2eArmorClass(data));
    });

    it(`${template.name} stores the Class DC its own components give`, () => {
      const stored = (data.classDC as { total?: number } | undefined)?.total;
      if (stored === undefined) return;
      expect(stored).toBe(pf2eClassDC(data));
    });
  }
});
