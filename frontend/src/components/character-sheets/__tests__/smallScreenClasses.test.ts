/**
 * The sheets' layout on a phone, as written in their classes.
 *
 * A sheet is laid out narrow first, with the desktop's arrangement behind
 * `sm:`. Two ways of writing a sheet break that on a phone however the rest is
 * written, so this check refuses them in every sheet file and in the shells:
 *
 *  - a grid of four or more columns on a phone, counting the columns of a
 *    template of its own (`grid-cols-[…]`). The unprefixed class is what a
 *    phone gets, so `grid-cols-6 sm:grid-cols-8` is six columns there. On a
 *    phone about 300 px is left for a sheet's content, so a fourth column
 *    gets under 70 px, and a template's fixed columns soon add up to more
 *    than the phone has. Give the phone fewer (`grid-cols-2 sm:grid-cols-4`).
 *    A layout meant to keep four or more columns on a phone is listed by
 *    file and class in KEEP_ON_A_PHONE, with the reason it fits. Grids of
 *    two and three columns are left to the screenshots: some of them fit a
 *    phone as they are.
 *  - a height in `vh` (or `h-screen`) below `sm`. The shells already scroll the
 *    sheet within the screen, and a box sized from the screen's height inside
 *    them is a second scroller nested in the first; on a phone `100vh` is also
 *    taller than what the browser shows. From `sm` up it is the desktop's
 *    business (`sm:max-h-[…vh]`); `dvh` follows what the browser shows and is
 *    allowed.
 *
 * The tab bar has its own check, in sheetTabs.test.tsx. jsdom evaluates no
 * media query, so the classes are what can be checked here; the screenshots
 * show the layout.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';

// The negated pattern does not keep the nested test folders out of this glob,
// so they are left out by name as well.
const SOURCES = Object.fromEntries(
  Object.entries(
    import.meta.glob(
      [
        '/src/components/character-sheets/**/*.tsx',
        '/src/components/character-sheets/**/*.ts',
        '/src/components/character/CharacterSheetViewerModal.tsx',
        '/src/components/character/CharacterSheetEditorModal.tsx',
        '/src/components/character/sheetShell.ts',
        '!/src/**/__tests__/**',
      ],
      { query: '?raw', import: 'default', eager: true }
    ) as Record<string, string>
  ).filter(([file]) => !file.includes('/__tests__/'))
);

/** Every class list in a file, with its line: each string, and each template's text. */
function classLists(file: string, source: string): { line: number; classes: string[] }[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lists: { line: number; classes: string[] }[] = [];
  const add = (node: ts.Node, text: string) =>
    lists.push({
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      classes: text.split(/\s+/).filter(Boolean),
    });
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text);
    // A template's literal parts are one list; the strings in its
    // expressions are visited as lists of their own.
    if (ts.isTemplateExpression(node)) add(node, [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' '));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return lists;
}

/** A class's variants (`sm:`, `hover:`) and the utility after them. */
function split(cls: string): { variants: string[]; utility: string } {
  const variants: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === '[') depth++;
    else if (cls[i] === ']') depth--;
    else if (cls[i] === ':' && depth === 0) {
      variants.push(cls.slice(start, i));
      start = i + 1;
    }
  }
  return { variants, utility: cls.slice(start) };
}

const WIDER = new Set(['sm', 'md', 'lg', 'xl', '2xl']);

/**
 * Phone layouts meant to keep four or more columns below `sm`, by file and
 * class, each with the reason it fits.
 */
const KEEP_ON_A_PHONE: Record<string, string> = {
  '/src/components/character-sheets/dnd5e/DnD5eCharacterEditor.tsx grid-cols-[minmax(0,1fr)_3.5rem_0.75rem_3.5rem_2.75rem]':
    "The D&D 5e editor's hit dice rows (HIT_DICE_COLUMNS). The class takes a line of its own (col-span-5); the die, left, slash, at full and remove share the next, in about 200 px of fixed columns and gaps, which leaves the die box at least about 60 px on a 360 px phone.",
};

/**
 * How many columns a `grid-cols-…` utility makes: its number, or the tracks of
 * its template (`[minmax(0,1fr)_auto]` is two, `[repeat(3,1fr)_2rem]` four).
 * Zero for anything else.
 */
function columnCount(utility: string): number {
  const counted = /^grid-cols-(\d+)$/.exec(utility);
  if (counted) return Number(counted[1]);
  const template = /^grid-cols-\[(.*)\]$/.exec(utility)?.[1];
  if (!template) return 0;
  const tracks: string[] = [];
  let depth = 0;
  let track = '';
  for (const ch of template) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === '_' && depth === 0) {
      tracks.push(track);
      track = '';
    } else track += ch;
  }
  tracks.push(track);
  return tracks.reduce((sum, t) => sum + Number(/^repeat\((\d+),/.exec(t)?.[1] ?? 1), 0);
}

/** What a file breaks: grids of four or more columns on a phone, and heights from the screen below sm. */
function problems(file: string, source: string): { wideGrids: string[]; screenHeights: string[] } {
  const wideGrids: string[] = [];
  const screenHeights: string[] = [];
  for (const { line, classes } of classLists(file, source)) {
    const parsed = classes.map(split);
    for (const { variants, utility } of parsed) {
      // The unprefixed form is what a phone gets, whatever `sm:` says.
      const wide = variants.length === 0 && columnCount(utility) >= 4;
      if (wide && !(`${file} ${utility}` in KEEP_ON_A_PHONE)) wideGrids.push(`${file}:${line} ${utility}`);
      const fromScreen = /(?<![a-z])vh\b/.test(utility) || /^(?:min-|max-)?h-screen$/.test(utility);
      if (fromScreen && !variants.some((v) => WIDER.has(v))) screenHeights.push(`${file}:${line} ${[...variants, utility].join(':')}`);
    }
  }
  return { wideGrids, screenHeights };
}

const ALL = Object.entries(SOURCES).map(([file, source]) => problems(file, source));

describe('the sheets on a phone', () => {
  it('are read, so the check is looking at the right files', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain('/src/components/character-sheets/dnd5e/DnD5eCharacterEditor.tsx');
    expect(files).toContain('/src/components/character/sheetShell.ts');
    expect(files.some((file) => file.includes('/__tests__/'))).toBe(false);
  });

  it('draw no grid of four or more columns on a phone, but those listed with their reason', () => {
    expect(ALL.flatMap((p) => p.wideGrids)).toEqual([]);
  });

  it('size nothing from the screen height below sm', () => {
    expect(ALL.flatMap((p) => p.screenHeights)).toEqual([]);
  });
});

// The check itself, on lines written to pass and to fail.
describe('the class check', () => {
  const grids = (source: string) => problems('/x.tsx', source).wideGrids.map((found) => found.split(' ')[1]);
  const heights = (source: string) => problems('/x.tsx', source).screenHeights.map((found) => found.split(' ')[1]);

  it('refuses a phone grid of four or more columns, whatever its sm: form', () => {
    expect(grids('<div className="grid grid-cols-6 sm:grid-cols-8" />')).toEqual(['grid-cols-6']);
    expect(grids('<div className="grid grid-cols-4 sm:grid-cols-4" />')).toEqual(['grid-cols-4']);
    expect(grids('const ROW = "grid grid-cols-[1fr_3rem_1rem_3rem] sm:grid-cols-[1fr_5rem_3rem_1rem_3rem]";')).toEqual(['grid-cols-[1fr_3rem_1rem_3rem]']);
  });

  it('passes a layout on the allow-list, in its own file only', () => {
    const [entry] = Object.keys(KEEP_ON_A_PHONE);
    const [file, utility] = entry.split(' ');
    const source = `const COLUMNS = "grid ${utility} sm:grid-cols-[minmax(0,1fr)_5.5rem]";`;
    expect(problems(file, source).wideGrids).toEqual([]);
    expect(problems('/src/components/character-sheets/elsewhere.tsx', source).wideGrids).toHaveLength(1);
  });

  it('lists only layouts the sheets still have, each with its reason', () => {
    for (const [entry, reason] of Object.entries(KEEP_ON_A_PHONE)) {
      const [file, utility] = entry.split(' ');
      expect(SOURCES[file], entry).toContain(utility);
      expect(reason.length, entry).toBeGreaterThan(40);
    }
  });

  it('refuses a wide grid with no sm: form, and passes one with it', () => {
    expect(grids('<div className="grid grid-cols-5 gap-3" />')).toEqual(['grid-cols-5']);
    expect(grids('<div className="grid grid-cols-[1fr_5rem_3rem_2rem] gap-2" />')).toEqual(['grid-cols-[1fr_5rem_3rem_2rem]']);
    expect(grids('<div className="grid grid-cols-[repeat(3,minmax(0,1fr))_2rem]" />')).toEqual(['grid-cols-[repeat(3,minmax(0,1fr))_2rem]']);
    expect(grids('<div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex" />')).toEqual([]);
    expect(grids('<div className={`grid grid-cols-4 ${wide ? "a" : "b"}`} />')).toEqual(['grid-cols-4']);
    expect(grids('<div className="grid grid-cols-4 md:grid-cols-8" />')).toEqual(['grid-cols-4']);
    expect(grids('<div className="grid grid-cols-3 sm:grid-cols-5" />')).toEqual([]);
    expect(grids('<div className="grid grid-cols-3 md:grid-cols-6" />')).toEqual([]);
    expect(grids('const ROW = "grid grid-cols-[1fr_2rem] sm:grid-cols-[1fr_4rem_2rem]";')).toEqual([]);
  });

  it('refuses a height from the screen below sm, and passes one from sm up or in dvh', () => {
    expect(heights('<div className="max-h-[calc(100vh-200px)] overflow-y-auto" />')).toEqual(['max-h-[calc(100vh-200px)]']);
    expect(heights('<div className="min-h-screen" />')).toEqual(['min-h-screen']);
    expect(heights('<div className="hover:h-[50vh]" />')).toEqual(['hover:h-[50vh]']);
    expect(heights('<div className="sm:max-h-[calc(100vh-200px)] sm:overflow-y-auto" />')).toEqual([]);
    expect(heights('<div className="h-dvh max-h-dvh sm:max-h-[95vh]" />')).toEqual([]);
  });

  it('counts the columns of a template', () => {
    expect(columnCount('grid-cols-6')).toBe(6);
    expect(columnCount('grid-cols-[minmax(0,1fr)_auto]')).toBe(2);
    expect(columnCount('grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_0.75rem_3.5rem_1.75rem]')).toBe(6);
    expect(columnCount('grid-cols-[repeat(4,minmax(0,1fr))]')).toBe(4);
    expect(columnCount('gap-2')).toBe(0);
  });

  it('reads a colon inside an arbitrary value as part of the value', () => {
    expect(split('sm:max-h-[calc(100vh-200px)]')).toEqual({ variants: ['sm'], utility: 'max-h-[calc(100vh-200px)]' });
    expect(split('[@media(hover:none)]:opacity-60')).toEqual({ variants: ['[@media(hover:none)]'], utility: 'opacity-60' });
  });
});
