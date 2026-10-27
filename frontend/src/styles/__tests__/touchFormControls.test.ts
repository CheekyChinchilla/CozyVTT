/**
 * Form controls on a touch screen are drawn at 16 px or more.
 *
 * Safari on an iPhone or an iPad zooms the page when a text box, a dropdown or
 * a text area smaller than 16 px takes focus, and leaves it zoomed. The sheets'
 * boxes are text-sm or text-xs and some of the campaign page's are 10 or 11 px,
 * so every one of them zoomed. index.css raises each to 16 px where the primary
 * pointer is coarse and leaves a larger box at its own size: a sheet's name in
 * text-3xl stays 30 px. jsdom evaluates no media query, so this reads the rule:
 * every size below 16 px a component can give a form control must be one it
 * raises, and a size written in a way the rule cannot raise (in em, a
 * percentage, clamp(), a variable, an inline style or a new stylesheet) fails
 * here until it is written in px or rem.
 */
import { describe, it, expect } from 'vitest';
import defaultTheme from 'tailwindcss/defaultTheme';
import indexCss from '../../index.css?raw';

interface Block {
  prelude: string;
  declarations: Map<string, string>;
  children: Block[];
}

/** index.css as nested blocks, comments dropped; enough for this file's rules. */
function parse(css: string): Block[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let at = 0;
  const readBlock = (prelude: string): Block => {
    const block: Block = { prelude, declarations: new Map(), children: [] };
    let pending = '';
    while (at < text.length) {
      const ch = text[at++];
      if (ch === '{') {
        block.children.push(readBlock(pending.trim().replace(/\s+/g, ' ')));
        pending = '';
      } else if (ch === '}') {
        break;
      } else if (ch === ';') {
        const colon = pending.indexOf(':');
        if (colon > 0) block.declarations.set(pending.slice(0, colon).trim(), pending.slice(colon + 1).trim());
        pending = '';
      } else {
        pending += ch;
      }
    }
    const colon = pending.indexOf(':');
    if (colon > 0) block.declarations.set(pending.slice(0, colon).trim(), pending.slice(colon + 1).trim());
    return block;
  };
  return readBlock('').children;
}

/** Every rule in the sheet, with the at-rules it sits in, outermost first. */
function rules(blocks: Block[], within: string[] = []): { within: string[]; block: Block }[] {
  return blocks.flatMap((block) =>
    block.prelude.startsWith('@')
      ? rules(block.children, [...within, block.prelude])
      : [{ within, block }, ...rules(block.children, [...within, block.prelude])]
  );
}

const toPx = (value: string): number => {
  const match = /^(\d*\.?\d+)(px|rem)$/.exec(value.trim());
  if (!match) throw new Error(`not a size in px or rem: ${value}`);
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
};

/** A `text-[…]` or `text-(…)` class with any variants before it, as Tailwind splits a class list. */
const ARBITRARY_TEXT = /(?<![^\s"'`{])([^\s"'`{}]*?:)?text-(\[[^\]\s"'`]+\]|\([^\s"'`]+?\))/g;

/** What a `text-[…]` or `text-(…)` value is to Tailwind: a colour, a size, or a size this check cannot read. */
function readTextValue(bracketed: string): { kind: 'colour' } | { kind: 'size'; px: number } | { kind: 'unreadable' } {
  const value = bracketed.slice(1, -1);
  // `text-(--name)` and `text-[var(--name)]` are colours to Tailwind unless hinted otherwise.
  if (bracketed.startsWith('(')) return /^(color:)?--[\w-]+$/.test(value) ? { kind: 'colour' } : { kind: 'unreadable' };
  if (/^(color:|#|var\(|(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\()/.test(value)) return { kind: 'colour' };
  const size = /^(?:length:)?(\d*\.?\d+)(px|rem)$/.exec(value);
  return size ? { kind: 'size', px: Number(size[1]) * (size[2] === 'rem' ? 16 : 1) } : { kind: 'unreadable' };
}

const STYLESHEETS = import.meta.glob('/src/**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/**
 * Stylesheets that may set a font size outside the touch rules, and why that
 * reaches no form control that zooms.
 */
const SIZED_STYLESHEETS: Record<string, string> = {
  '/src/styles/note-markdown.css': 'a note read as Markdown; its only control is a task list tick, which does not zoom the page',
};

const SOURCES = import.meta.glob(['/src/**/*.tsx', '/src/**/*.ts', '!/src/**/__tests__/**', '!/src/**/*.test.ts', '!/src/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const all = rules(parse(indexCss));
const coarse = all.filter(({ within }) => within.includes('@media (pointer: coarse)'));

/** The theme's font sizes, Tailwind's own and any index.css adds, by name. */
const themeSizes = (() => {
  const sizes = new Map<string, number>();
  for (const [name, [size]] of Object.entries(defaultTheme.fontSize)) {
    if (typeof size !== 'string') throw new Error(`text-${name} has no size`);
    sizes.set(name, toPx(size));
  }
  const theme = parse(indexCss).find((block) => block.prelude === '@theme');
  for (const [property, value] of theme?.declarations ?? []) {
    const name = /^--text-([a-z0-9]+)$/.exec(property)?.[1];
    if (name) sizes.set(name, toPx(value));
  }
  return sizes;
})();

describe('form controls on a coarse pointer', () => {
  it('reads index.css and the theme, so the check is looking at the right rules', () => {
    expect(all.length).toBeGreaterThan(20);
    expect(themeSizes.get('sm')).toBe(14);
    expect(themeSizes.get('3xl')).toBe(30);
  });

  const controls = coarse.find(
    ({ within, block }) => within.includes('@layer base') && block.prelude.replace(/\s/g, '') === 'input,select,textarea'
  );

  it('have a rule of their own in the base layer, under the utilities that size them', () => {
    expect(controls, 'an `input, select, textarea` rule in @layer base inside @media (pointer: coarse)').toBeDefined();
  });

  it('take at least 16 px when no class gives them a size', () => {
    expect(controls?.block.declarations.get('font-size')).toBe('max(1rem, 1em)');
  });

  const small = [...themeSizes].filter(([, px]) => px < 16).map(([name]) => name);

  it.each(small)('take 16 px from the text-%s class', (name) => {
    expect(controls?.block.declarations.get(`--text-${name}`)).toBe('1rem');
  });

  it('take 16 px from every size below 16 px written in pixels or rem in a component', () => {
    const used = new Set<string>();
    for (const source of Object.values(SOURCES)) {
      for (const match of source.matchAll(ARBITRARY_TEXT)) {
        const read = readTextValue(match[2]);
        if (read.kind === 'size' && read.px < 16) used.add(match[0]);
      }
    }
    expect(used.size).toBeGreaterThan(0);

    const raising = coarse.filter(({ block }) => block.declarations.get('font-size') === '1rem');
    const named = new Set(raising.flatMap(({ block }) => [...block.prelude.matchAll(/\[class~='([^']+)'\]/g)].map((m) => m[1])));
    for (const { within, block } of raising) {
      // Outside any layer, so it wins over the class it names; it names only
      // small sizes, so it never makes a box smaller.
      expect(within.some((at) => at.startsWith('@layer')), block.prelude).toBe(false);
      expect(block.prelude.replace(/\s/g, '')).toMatch(/^:is\(input,select,textarea\):is\(/);
    }
    expect([...used].filter((size) => !named.has(size)), 'sizes below 16 px no rule raises').toEqual([]);
  });

  // The rule names the class, so it cannot tell how big an em, a percentage,
  // clamp() or a variable comes out; such a size is refused, wherever it is.
  it('are given no text size the rule cannot read', () => {
    const unreadable = Object.entries(SOURCES).flatMap(([file, source]) =>
      [...source.matchAll(ARBITRARY_TEXT)].filter((match) => readTextValue(match[2]).kind === 'unreadable').map((match) => `${file}: ${match[0]}`)
    );
    expect(unreadable, 'write a text size in px or rem, so the touch rule can raise one under 16 px').toEqual([]);
  });

  // An inline style beats every stylesheet rule, so nothing can raise it. The
  // source cannot say which element a style object reaches, so any is refused.
  it('are given no font size in a style object', () => {
    const inline = Object.entries(SOURCES).flatMap(([file, source]) =>
      [...source.matchAll(/\bfontSize\s*:|\bfont-size\s*:/g)].map((match) => `${file}: ${match[0]}`)
    );
    expect(inline, 'size text with a class, which the touch rule can raise').toEqual([]);
  });

  it('are given no font size by a stylesheet the touch rules do not cover', () => {
    const empty = Object.entries(STYLESHEETS).filter(([, css]) => css.trim() === '').map(([file]) => file);
    // Vitest reads a stylesheet as empty unless vitest.config.ts includes it.
    expect(empty, 'stylesheets read as empty: add them to css.include in vitest.config.ts').toEqual([]);
    const sized = Object.entries(STYLESHEETS).flatMap(([file, css]) => {
      if (file in SIZED_STYLESHEETS) return [];
      const blocks = parse(css);
      const atRules = (list: Block[], within: string[] = []): { within: string[]; block: Block }[] =>
        list.flatMap((block) => [{ within, block }, ...atRules(block.children, [...within, block.prelude])]);
      return atRules(blocks)
        .filter(({ block }) => block.declarations.has('font-size'))
        .filter(({ within }) => !(file === '/src/index.css' && within.includes('@media (pointer: coarse)')))
        .map(({ block }) => `${file}: ${block.prelude}`);
    });
    expect(sized).toEqual([]);
  });

  // An unlayered line height would beat a leading-* on the same box.
  it('keep the line height their classes give them when raised by name', () => {
    const raising = coarse.filter(({ within, block }) => !within.some((at) => at.startsWith('@layer')) && block.declarations.get('font-size') === '1rem');
    expect(raising.length).toBeGreaterThan(0);
    expect(raising.map(({ block }) => block.declarations.get('line-height')).filter((value) => value !== undefined)).toEqual([]);
  });

  it('keep a larger size, since nothing sets the font size outright', () => {
    const outright = coarse.filter(({ block }) => /\b(input|select|textarea)\b/.test(block.prelude) && !/:is\(/.test(block.prelude))
      .map(({ block }) => block.declarations.get('font-size'))
      .filter((value) => value !== undefined && value !== 'max(1rem, 1em)');
    expect(outright).toEqual([]);
  });
});
