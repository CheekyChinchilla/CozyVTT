/**
 * Every control on the compact layout's sheets and map is a finger's size.
 *
 * The session panels, the Party content and the map's chrome were written
 * for a mouse in a desktop column: many of their buttons were 20 to 38 px,
 * under the 44 by 44 CSS px a fingertip needs, and the compact layout shows
 * them on a phone. The arrangement marks those containers `finger-controls`,
 * and index.css gives every control inside one at least 44 by 44, outside
 * any layer so the panels' own height classes cannot undo it; the desktop's
 * columns carry no mark and keep their sizes. jsdom applies no stylesheet,
 * so this reads the rules.
 */
import { it, expect } from 'vitest';
import indexCss from '../../index.css?raw';

const css = indexCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** Each top-level rule whose selector starts with .finger-controls, by its declarations. */
function rules(): Array<{ selector: string; body: string }> {
  return [...css.matchAll(/(^|\n)(\.finger-controls[^{]*)\{([^}]*)\}/g)].map((m) => ({ selector: m[2].replace(/\s+/g, ' ').trim(), body: m[3] }));
}

const holding = (property: string) => rules().filter((r) => new RegExp(`${property}\\s*:\\s*2\\.75rem`).test(r.body)).map((r) => r.selector).join(' ');

it('raises every button, link, tab, list and box inside it to 44 px tall', () => {
  for (const control of ['button', 'select', 'summary', "a[href]", "[role='button']", "[role='tab']", 'input']) {
    expect(holding('min-height'), control).toContain(control);
  }
});

it('raises every button, link and tab to 44 px wide', () => {
  for (const control of ['button', 'summary', "a[href]", "[role='button']", "[role='tab']"]) {
    expect(holding('min-width'), control).toContain(control);
  }
});

it('makes a check box or a radio button take a finger through its label', () => {
  expect(holding('min-height')).toMatch(/label:has\(> ?input:is\(\[type='checkbox'\], ?\[type='radio'\]\)\)/);
});

it("is outside every layer, so a panel's own height class cannot undo it", () => {
  const at = css.indexOf('.finger-controls');
  expect(at).toBeGreaterThan(-1);
  const before = css.slice(0, at);
  const depth = [...before].reduce((d, ch) => d + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0);
  expect(depth).toBe(0);
});
