/**
 * The stored sheets the frontend's editor test saves (storedSheetUntouched in
 * frontend/src/components/character-sheets/__tests__) hold every field their
 * system's schema takes, each piece of typed text different from every other,
 * and the schema takes them as they are.
 *
 * That test compares what each editor saves for these sheets with a committed
 * copy. A field missing here is one it cannot see change, so a field added to
 * a schema fails here until the sheet has it too.
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { walkSheetSchema } from '../../../__tests__/helpers/sheetSchemaWalk';
import { fifthEditionCharacterDataSchema } from '../fifthEdition.schema';
import { fantasyD20CharacterDataSchema } from '../fantasyD20.schema';
import { HorrorD100SheetSchema } from '../horrorD100Sheet.schema';

const dir = path.resolve(__dirname, '../../../../../frontend/src/components/character-sheets/__tests__/storedSheets');

/** Every field an object in `schema` declares, as `a.b[].c`, a union's options taken together. */
function fieldsOf(schema: z.ZodType): string[] {
  const found = new Set<string>();
  walkSheetSchema(schema, '', (node, at) => {
    if (!(node instanceof z.ZodObject)) return;
    const parent = at.replace(/\|\d+/g, '');
    for (const key of Object.keys(node.shape as Record<string, z.ZodType>)) found.add(parent ? `${parent}.${key}` : key);
  });
  return [...found].sort();
}

/** The values a field limited to a list of choices may hold, which repeat by design. */
function choicesOf(schema: z.ZodType): Set<string> {
  const found = new Set<string>();
  walkSheetSchema(schema, '', (node) => {
    if (node instanceof z.ZodEnum) for (const option of node.options as readonly string[]) found.add(option);
  });
  return found;
}

/** Every field `value` holds, written as fieldsOf writes them, and every piece of text in it. */
function contentsOf(value: unknown, at = '', fields = new Set<string>(), texts: string[] = []): { fields: Set<string>; texts: string[] } {
  if (Array.isArray(value)) {
    value.forEach((entry) => contentsOf(entry, `${at}[]`, fields, texts));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      const field = at ? `${at}.${key}` : key;
      fields.add(field);
      contentsOf(entry, field, fields, texts);
    }
  } else if (typeof value === 'string') {
    texts.push(value);
  }
  return { fields, texts };
}

describe.each([
  ['5e', fifthEditionCharacterDataSchema],
  ['fantasy-d20', fantasyD20CharacterDataSchema],
  ['horror-d100', HorrorD100SheetSchema],
] as const)('the stored %s sheet', (file, schema) => {
  const sheet: unknown = JSON.parse(fs.readFileSync(path.join(dir, `${file}.json`), 'utf8'));
  const { fields, texts } = contentsOf(sheet);

  it('holds every field the schema takes', () => {
    expect(fieldsOf(schema).filter((field) => !fields.has(field))).toEqual([]);
  });

  it('gives every piece of typed text a value of its own', () => {
    const typed = texts.filter((text) => !choicesOf(schema).has(text));
    expect(typed.filter((text, i) => typed.indexOf(text) !== i)).toEqual([]);
  });

  it('is a sheet the schema takes', () => {
    const result = schema.safeParse(sheet);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });
});

// The sheets in storedSheets/minimal/ hold only what a 1.6.0 blank starter
// sheet held (the Horror d100 one, whose sheet 1.7.0 rebuilt, only what its
// schema requires), so the editor test sees the defaults it adds to a sheet
// that lacks the rest. Each is still one its schema takes as it is.
describe.each([
  ['5e', fifthEditionCharacterDataSchema],
  ['fantasy-d20', fantasyD20CharacterDataSchema],
  ['horror-d100', HorrorD100SheetSchema],
] as const)('the minimal stored %s sheet', (file, schema) => {
  it('is a sheet the schema takes', () => {
    const sheet: unknown = JSON.parse(fs.readFileSync(path.join(dir, 'minimal', `${file}.json`), 'utf8'));
    const result = schema.safeParse(sheet);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });
});
