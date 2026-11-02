/**
 * The fog panel's per-map switch.
 *
 * Fog used to be permanently on for every map. The panel now carries the
 * switch: on, it offers the reveal and hide tools; off, it says so and offers
 * nothing that would change what players see. Turning it off also puts an
 * armed tool down, for the same reason folding the panel does.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DmFogControls, { type FogToolMode } from '../DmFogControls';
import { PRESET_THEMES, applyThemeColors, hexToRgbChannels } from '@/themes';
import { AA_TEXT, contrastRatioChannels } from '@/utils/color';
import tailwindTheme from 'tailwindcss/theme.css?raw';

function renderPanel(over: Partial<{ fogMode: FogToolMode; fogEnabled: boolean; onResetExploration: () => void }> = {}) {
  const props = {
    fogMode: null as FogToolMode,
    onFogModeChange: vi.fn(),
    onRevealAll: vi.fn(),
    onHideAll: vi.fn(),
    fogEnabled: true,
    onFogEnabledChange: vi.fn(),
    ...over,
  };
  render(<DmFogControls {...props} />);
  fireEvent.click(screen.getByText('Fog of War')); // the panel starts folded
  return props;
}

describe('DmFogControls', () => {
  it('offers the reveal and hide tools while fog is on', () => {
    renderPanel();
    expect(screen.getByLabelText('Fog reveal box')).toBeTruthy();
    expect(screen.getByLabelText('Reveal entire map')).toBeTruthy();
    expect((screen.getByLabelText('Fog of war on this map') as HTMLInputElement).checked).toBe(true);
  });

  it('replaces the tools with an explanation while fog is off', () => {
    renderPanel({ fogEnabled: false });
    expect(screen.queryByLabelText('Fog reveal box')).toBeNull();
    expect(screen.queryByLabelText('Reveal entire map')).toBeNull();
    expect(screen.getByText(/Fog is off/)).toBeTruthy();
    expect((screen.getByLabelText('Fog of war on this map') as HTMLInputElement).checked).toBe(false);
  });

  it('turning fog off puts an armed tool down and reports the change', () => {
    const props = renderPanel({ fogMode: 'fog-reveal' });
    fireEvent.click(screen.getByLabelText('Fog of war on this map'));
    expect(props.onFogModeChange).toHaveBeenCalledWith(null);
    expect(props.onFogEnabledChange).toHaveBeenCalledWith(false);
  });

  it('offers to reset explored areas only when there is memory to forget, and asks twice', () => {
    renderPanel();
    expect(screen.queryByLabelText('Reset explored areas')).toBeNull();
  });

  it('resets explored areas on the second click', () => {
    const onResetExploration = vi.fn();
    renderPanel({ onResetExploration });
    const button = screen.getByLabelText('Reset explored areas');
    fireEvent.click(button);
    expect(onResetExploration).not.toHaveBeenCalled();
    expect(button.textContent).toMatch(/Confirm/);
    fireEvent.click(button);
    expect(onResetExploration).toHaveBeenCalledTimes(1);
  });

  it('turning fog on reports the change and leaves the tool alone', () => {
    const props = renderPanel({ fogEnabled: false });
    fireEvent.click(screen.getByLabelText('Fog of war on this map'));
    expect(props.onFogEnabledChange).toHaveBeenCalledWith(true);
    expect(props.onFogModeChange).not.toHaveBeenCalled();
  });
});

// The title that folds the panel was a clickable box, out of reach of Tab and
// silent about whether the panel was open.
describe('the Fog of War title', () => {
  it('is a button that says whether the panel is open, and folds it', () => {
    render(
      <DmFogControls fogMode={null} onFogModeChange={vi.fn()} onRevealAll={vi.fn()} onHideAll={vi.fn()} fogEnabled onFogEnabledChange={vi.fn()} />
    );
    const title = screen.getByRole('button', { name: 'Fog of War' });
    expect(title).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(title);

    expect(title).toHaveAttribute('aria-expanded', 'true');
    const body = document.getElementById(title.getAttribute('aria-controls') ?? '');
    expect(body).toContainElement(screen.getByLabelText('Fog of war on this map'));
  });
});

// Reveal all's Confirm? was white on lime-500, about 2 to 1, and each Confirm?
// pulsed to half its opacity, which took even dark text on the fill to about
// 3.2 to 1 (2.3 on amber) at the dip. A colour class is looked up in the
// stylesheets: a palette colour stays whatever the theme, and a theme colour
// is read from the theme applied, in each preset theme. The label is checked
// at the lowest opacity any animation or opacity class on it, or on what holds
// it, takes it to, over the panel behind, taken as opaque.
describe('each bulk action asking Confirm?', () => {
  const stylesheets = import.meta.glob<string>(['/src/index.css', '/src/styles/tailwind3-palette.css'], { query: '?raw', import: 'default', eager: true });
  const css = `${Object.values(stylesheets).join('\n')}\n${tailwindTheme}`;
  const definition = (name: string) => new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css)?.[1].trim();
  /** The colour `<prefix>-<name>` paints, as channels, under the theme applied now. */
  const channelsOf = (name: string): string => {
    if (name === 'white') return '255 255 255';
    const value = definition(name);
    if (!value) throw new Error(`no --color-${name} in the stylesheets`);
    const themed = /^rgb\(var\((--rgb-[\w-]+)\)\)$/.exec(value);
    return themed ? document.documentElement.style.getPropertyValue(themed[1]).trim() : hexToRgbChannels(value);
  };
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  /** An element's own colour class of a kind, `bg` or `text`, leaving sizes such as text-xs. */
  const colourClass = (el: Element, kind: 'bg' | 'text') => classesOf(el).flatMap((c) => {
    const found = new RegExp(`^${kind}-([\\w-]+?)(?:/\\d+)?$`).exec(c);
    return found && (found[1] === 'white' || definition(found[1])) ? [found[1]] : [];
  });
  /** The keyframes' lowest opacity, 1 where they leave it alone. */
  const keyframesLowest = (name: string): number => {
    const at = css.indexOf(`@keyframes ${name} {`);
    if (at < 0) throw new Error(`no @keyframes ${name}`);
    let depth = 0;
    let end = at;
    for (let i = css.indexOf('{', at); i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) { end = i; break; }
    }
    return Math.min(1, ...[...css.slice(at, end).matchAll(/opacity:\s*([\d.]+)/g)].map((m) => Number(m[1])));
  };
  /** The lowest opacity an element's own classes take it to: opacity-N, and the dip of an animate-<name>. */
  const ownLowest = (el: Element): number => classesOf(el).reduce((low, c) => {
    const opacity = /^opacity-(\d+)$/.exec(c);
    if (opacity) return low * Number(opacity[1]) / 100;
    const animation = /^animate-([\w-]+)$/.exec(c);
    if (!animation) return low;
    const keyframes = new RegExp(`--animate-${animation[1]}:\\s*([\\w-]+)`).exec(css)?.[1];
    if (!keyframes) throw new Error(`no --animate-${animation[1]}`);
    return low * keyframesLowest(keyframes);
  }, 1);
  const mix = (fg: string, back: string, alpha: number) => {
    const f = fg.split(/\s+/).map(Number);
    const b = back.split(/\s+/).map(Number);
    return f.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha))).join(' ');
  };

  afterEach(() => { document.documentElement.removeAttribute('style'); });

  it('finds the pulse it is checking for', () => {
    expect(keyframesLowest('pulse')).toBe(0.5);
  });

  it.each(['Reveal entire map', 'Hide entire map', 'Reset explored areas'])('%s reads at 4.5 to 1 or more in every theme, through its pulse', (label) => {
    renderPanel({ onResetExploration: vi.fn() });
    const button = screen.getByLabelText(label);
    fireEvent.click(button);
    expect(button).toHaveTextContent('Confirm?');
    const [text, ...moreText] = colourClass(button, 'text');
    const [back, ...moreBack] = colourClass(button, 'bg');
    expect([text, back, moreText, moreBack], button.className).toEqual([expect.any(String), expect.any(String), [], []]);
    // What the button is drawn over, and how faint its label gets on the way up to it.
    let alpha = ownLowest(button);
    let holder = button.parentElement;
    while (holder && colourClass(holder, 'bg').length === 0) {
      alpha *= ownLowest(holder);
      holder = holder.parentElement;
    }
    expect(holder, 'a panel behind the button').not.toBeNull();
    const panel = colourClass(holder!, 'bg')[0]!;

    const low: string[] = [];
    for (const theme of PRESET_THEMES) {
      applyThemeColors(theme.colors);
      const behind = channelsOf(panel);
      const ratio = contrastRatioChannels(mix(channelsOf(text!), behind, alpha), mix(channelsOf(back!), behind, alpha));
      if (ratio < AA_TEXT) low.push(`${theme.name}: text-${text} on bg-${back} at ${alpha * 100}% over bg-${panel} = ${ratio.toFixed(2)}:1`);
    }
    expect(low).toEqual([]);
  });
});
