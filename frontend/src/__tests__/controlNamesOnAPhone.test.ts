/**
 * A control keeps its name on a phone.
 *
 * A button whose words are in an element hidden below a breakpoint
 * (`hidden sm:inline`) shows only its icon on a phone, and display: none
 * takes the words out of its accessible name as well, so a screen reader
 * says "button" and nothing more. Such a control needs a name left below
 * the breakpoint: words only a screen reader gets there (`max-sm:sr-only`
 * in place of `hidden sm:inline`, which looks the same), an `aria-label`,
 * `aria-labelledby` or `title`, or other words a phone shows. jsdom
 * evaluates no media query, so this reads every component's markup: each
 * control (a `button` or an `a`, or the `Button`, `Link` and `NavLink`
 * components) holding an element hidden below a breakpoint must have one
 * of those. A value written straight into the control, such as `{icon}`,
 * is not counted as words; one inside a shown `span` is.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';

// The negated pattern does not keep the nested test folders out of this glob,
// so they are left out by name as well.
const SOURCES = Object.fromEntries(
  Object.entries(
    import.meta.glob(['/src/**/*.tsx', '!/src/**/__tests__/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  ).filter(([file]) => !file.includes('/__tests__/') && !file.includes('.test.'))
);

const CONTROLS = new Set(['button', 'a', 'Button', 'Link', 'NavLink']);
const NAMING = new Set(['aria-label', 'aria-labelledby', 'title']);
/** Elements whose expressions are words: a value in a span is text. */
const TEXT_ELEMENTS = new Set(['span', 'strong', 'em', 'b', 'i', 'small', 'p', 'kbd']);
/** A class that shows an element from a breakpoint up. */
const SHOWN_FROM_A_BREAKPOINT = /^(sm|md|lg|xl|2xl):(inline|inline-block|inline-flex|block|flex|grid|contents)$/;

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement;

const opening = (node: Jsx) => (ts.isJsxElement(node) ? node.openingElement : node);
const tagName = (node: Jsx) => opening(node).tagName.getText();

function attribute(node: Jsx, name: string): ts.JsxAttribute | undefined {
  return opening(node).attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name
  );
}

/** The classes an element is given: every string in its className, a cn() call's and a template's included. */
function classes(node: Jsx): string[] {
  const initializer = attribute(node, 'className')?.initializer;
  if (!initializer) return [];
  const words: string[] = [];
  const visit = (part: ts.Node) => {
    if (ts.isStringLiteral(part) || ts.isNoSubstitutionTemplateLiteral(part)) words.push(...part.text.split(/\s+/));
    if (ts.isTemplateExpression(part)) words.push(...[part.head.text, ...part.templateSpans.map((span) => span.literal.text)].join(' ').split(/\s+/));
    ts.forEachChild(part, visit);
  };
  visit(initializer);
  return words.filter(Boolean);
}

/** Hidden on a phone and shown from a breakpoint up, as `hidden sm:inline` is. */
const hiddenBelowABreakpoint = (node: Jsx) => {
  const list = classes(node);
  return list.includes('hidden') && list.some((cls) => SHOWN_FROM_A_BREAKPOINT.test(cls));
};

/** Whether `node` is left out on a phone: hidden there, or hidden from a screen reader. */
function offOnAPhone(node: Jsx): boolean {
  const ariaHidden = attribute(node, 'aria-hidden')?.initializer;
  if (ariaHidden && ariaHidden.getText().replace(/[{}'"]/g, '') === 'true') return true;
  return classes(node).includes('hidden');
}

const jsxChildren = (node: Jsx): readonly ts.JsxChild[] => (ts.isJsxElement(node) ? node.children : []);

/** Whether the children of `node` hold words a phone's screen reader gets. */
function speaksOnAPhone(node: Jsx): boolean {
  const inText = TEXT_ELEMENTS.has(tagName(node));
  return jsxChildren(node).some((child) => {
    if (ts.isJsxText(child)) return child.text.trim() !== '';
    if (ts.isJsxExpression(child)) {
      if (!child.expression) return false;
      if (inText) return true;
      return ts.isStringLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression) || ts.isTemplateExpression(child.expression);
    }
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) return !offOnAPhone(child) && speaksOnAPhone(child);
    return false;
  });
}

/** Whether `node`'s content, not counting controls inside it, holds an element hidden below a breakpoint. */
function hidesWordsBelowABreakpoint(node: Jsx): boolean {
  return jsxChildren(node).some(
    (child) =>
      (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) &&
      !CONTROLS.has(tagName(child)) &&
      (hiddenBelowABreakpoint(child) || hidesWordsBelowABreakpoint(child))
  );
}

/** Each control in `source` that hides its words below a breakpoint, as `line: <tag>`, and whether it keeps a name there. */
function controlsHidingWords(file: string, source: string): { at: string; named: boolean }[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { at: string; named: boolean }[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && CONTROLS.has(tagName(node)) && hidesWordsBelowABreakpoint(node)) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const named = [...NAMING].some((name) => attribute(node, name) !== undefined) || speaksOnAPhone(node);
      found.push({ at: `${line}: <${tagName(node)}>`, named });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

const unnamed = (source: string) => controlsHidingWords('fixture.tsx', source).filter((control) => !control.named).map((control) => control.at);

describe('the rule', () => {
  it('finds a control whose only words are hidden on a phone', () => {
    expect(unnamed('<Button onClick={f}><Upload /><span className="hidden sm:inline">Upload Asset</span></Button>')).toEqual(['1: <Button>']);
    expect(unnamed('<button>\n  <span className="font-bold hidden md:block">Read</span>\n</button>')).toEqual(['1: <button>']);
    expect(unnamed('<a href="/x"><span className={cn("hidden", "lg:inline")}>Docs</span></a>')).toEqual(['1: <a>']);
  });

  it('does not count an icon or another value written straight into the control as words', () => {
    expect(unnamed('<Button>{icon}<span className="hidden sm:inline">{label}</span></Button>')).toEqual(['1: <Button>']);
  });

  it('passes a control named another way, or with words a phone shows', () => {
    expect(unnamed('<Button><span className="max-sm:sr-only">Upload Asset</span></Button>')).toEqual([]);
    expect(unnamed('<Button aria-label="Refresh data"><span className="hidden sm:inline">Refresh</span></Button>')).toEqual([]);
    expect(unnamed('<Button title="Back to Dashboard"><span className="hidden sm:inline">Dashboard</span></Button>')).toEqual([]);
    expect(unnamed('<Button><span className="hidden sm:inline">Back to Dashboard</span><span className="sm:hidden">Dashboard</span></Button>')).toEqual([]);
    expect(unnamed('<Button><span className="hidden sm:inline">All</span> assets</Button>')).toEqual([]);
    expect(unnamed('<Button><span className="hidden sm:inline">Show</span><span>{count}</span></Button>')).toEqual([]);
  });

  it('does not count words a screen reader is not given', () => {
    expect(unnamed('<Button><span aria-hidden="true">x</span><span className="hidden sm:inline">Close</span></Button>')).toEqual(['1: <Button>']);
  });

  it('leaves alone an element hidden on a phone outside any control', () => {
    expect(controlsHidingWords('fixture.tsx', '<div><span className="hidden sm:inline">Active</span></div>')).toEqual([]);
  });
});

describe('every control in the app', () => {
  it('keeps a name on a phone when it hides its words there', () => {
    const failures = Object.entries(SOURCES).flatMap(([file, source]) =>
      controlsHidingWords(file, source)
        .filter((control) => !control.named)
        .map((control) => `${file}:${control.at}`)
    );
    expect(failures).toEqual([]);
  });

  it('reads the controls it is meant to: some of them hide words on a phone', () => {
    const checked = Object.entries(SOURCES).flatMap(([file, source]) => controlsHidingWords(file, source).map((control) => `${file}:${control.at}`));
    expect(checked.some((at) => at.startsWith('/src/pages/DashboardPage.tsx'))).toBe(true);
  });
});
