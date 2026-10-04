/**
 * Every built-in template comes back from its game-system schema with every
 * key it went in with.
 *
 * The character routes store what the schema returns, and a Zod object strips
 * keys it does not declare. That is the point (a client cannot smuggle keys
 * into the sheet blob), but it also means a field the templates carry that
 * the schema forgot would be silently dropped on every save. This pins that
 * the two agree, for every template of every system.
 */

import { getAllTemplates } from '..';
import { validateCharacterData } from '../../../validators/game-systems';
import type { GameSystem } from '../../../game-systems';

/** Every key path in a plain-object tree, arrays descended by index. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => keyPaths(item, `${prefix}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      return [path, ...keyPaths(v, path)];
    });
  }
  return [];
}

describe('built-in templates survive their schema', () => {
  const templates = Object.values(getAllTemplates()).flat();

  it('has templates to check', () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it.each(templates.map((t) => [t.gameSystem, t.name, t] as const))(
    '%s: "%s" loses no keys',
    (_system, _name, template) => {
      const result = validateCharacterData(template.gameSystem as GameSystem, template.data);
      expect(result.success).toBe(true);
      if (!result.success) return;
      const before = keyPaths(template.data);
      const after = new Set(keyPaths(result.data));
      const missing = before.filter((p) => !after.has(p));
      expect(missing).toEqual([]);
    },
  );
});
