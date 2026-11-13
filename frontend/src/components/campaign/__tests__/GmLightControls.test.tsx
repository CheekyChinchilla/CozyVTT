/**
 * The Lights panel's Global Illumination switch and its warning.
 *
 * With lighting on, Global Illumination off and no lights placed, players
 * see only their darkvision, which for most tokens is nothing. The panel
 * says so, because a GM who has just untied the setting from "see
 * everything" needs to know why the map went dark for the table.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ts from 'typescript';
import GmLightControls from '../GmLightControls';

function renderPanel(over: Partial<{ lightCount: number; lightingEnabled: boolean; globalIllumination: boolean }> = {}) {
  const onGlobalIlluminationChange = vi.fn();
  render(
    <GmLightControls
      lightMode={null}
      onLightModeChange={vi.fn()}
      lightCount={0}
      onClearAll={vi.fn()}
      lightingEnabled
      globalIllumination={false}
      onGlobalIlluminationChange={onGlobalIlluminationChange}
      {...over}
    />
  );
  fireEvent.click(screen.getByText(/^Lights/)); // the panel starts folded
  return { onGlobalIlluminationChange };
}

const WARNING = /No lights placed and Global Illumination is off/;

describe('GmLightControls', () => {
  it('warns when lighting is on, Global Illumination is off and there are no lights', () => {
    renderPanel();
    expect(screen.getByText(WARNING)).toBeTruthy();
  });

  it('does not warn once a light is placed', () => {
    renderPanel({ lightCount: 1 });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('does not warn under Global Illumination', () => {
    renderPanel({ globalIllumination: true });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('does not warn while dynamic lighting is off, and disables the switch', () => {
    renderPanel({ lightingEnabled: false });
    expect(screen.queryByText(WARNING)).toBeNull();
    expect((screen.getByLabelText('Global Illumination') as HTMLInputElement).disabled).toBe(true);
  });

  // As Edit Map, the guides and the panel's own warning spell it.
  it('names the switch Global Illumination, on the screen and for a screen reader', () => {
    renderPanel();
    expect(screen.getByRole('checkbox', { name: 'Global Illumination' }).closest('label')).toHaveTextContent(/^Global Illumination$/);
  });

  it('reports the switch being ticked', () => {
    const { onGlobalIlluminationChange } = renderPanel();
    fireEvent.click(screen.getByLabelText('Global Illumination'));
    expect(onGlobalIlluminationChange).toHaveBeenCalledWith(true);
  });
});

// The colour box refused every value but a complete colour, so each key
// typed into it was undone at once and nothing could be typed there.
describe('the light colour box', () => {
  function renderColour() {
    const onDefaultsChange = vi.fn();
    render(
      <GmLightControls
        lightMode="light-place"
        onLightModeChange={vi.fn()}
        lightCount={0}
        onClearAll={vi.fn()}
        onDefaultsChange={onDefaultsChange}
        placementDefaults={{ brightRadius: 4, dimRadius: 8, color: '#ffcc66' }}
      />
    );
    fireEvent.click(screen.getByText(/^Lights/));
    return { onDefaultsChange, box: screen.getByPlaceholderText('#ffcc66') as HTMLInputElement };
  }

  it('takes a colour typed one key at a time', async () => {
    const { onDefaultsChange, box } = renderColour();
    await userEvent.clear(box);
    await userEvent.type(box, '#FF9933');
    expect(box.value).toBe('#FF9933');
    expect(onDefaultsChange).toHaveBeenLastCalledWith({ brightRadius: 4, dimRadius: 8, color: '#ff9933' });
  });

  it('takes a colour typed without the #', async () => {
    const { onDefaultsChange, box } = renderColour();
    await userEvent.clear(box);
    await userEvent.type(box, '66aaff');
    expect(onDefaultsChange).toHaveBeenLastCalledWith({ brightRadius: 4, dimRadius: 8, color: '#66aaff' });
  });

  it('goes back to the colour in use when left unfinished', async () => {
    const { onDefaultsChange, box } = renderColour();
    await userEvent.clear(box);
    await userEvent.type(box, '#ff9');
    expect(box.value).toBe('#ff9');
    fireEvent.blur(box);
    expect(box.value).toBe('#ffcc66');
    expect(onDefaultsChange).not.toHaveBeenCalled();
  });
});

// The title that folds the panel was a clickable box, out of reach of Tab and
// silent about whether the panel was open.
describe('the Lights title', () => {
  it('is a button that says whether the panel is open, and folds it', () => {
    render(<GmLightControls lightMode={null} onLightModeChange={vi.fn()} lightCount={2} onClearAll={vi.fn()} lightingEnabled />);
    // A space between the word and the count, which read as "Lights(2)".
    const title = screen.getByRole('button', { name: 'Lights (2)' });
    expect(title).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(title);

    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(title.getAttribute('aria-controls') ?? '')).not.toBeNull();
  });
});

// The setting is written one way wherever a user reads or hears its name: the
// Lights panel, Edit Map and the message when a change fails. Only what a
// page may show or speak is read, a JSX text or a string's or a template's
// text, such as a label, an aria-label, a title or a message; comments and
// code are left alone.
describe('the name Global Illumination', () => {
  const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/__tests__/**', '!/src/**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true });

  /** The text in a source a page may show or speak: JSX text, and string and template text. */
  function shownText(file: string, source: string): string[] {
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) found.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
  }

  it('reads what a page shows, and not comments or names', () => {
    const sample = [
      '// skipped under global illumination',
      'const globalIllumination = true;',
      'export const Switch = () => <label title="Lit" aria-label="Global illumination">Global illumination</label>;',
      "export const message = `Could not change ${'x'} global illumination`;",
    ].join('\n');
    expect(shownText('/sample.tsx', sample)).toEqual(['Lit', 'Global illumination', 'Global illumination', 'Could not change ', 'x', ' global illumination']);
  });

  it('is spelled Global Illumination wherever a page shows it', () => {
    expect(Object.keys(sources)).toContain('/src/components/campaign/GmLightControls.tsx');
    // Only a source with the word in it can show it: the rest are not parsed.
    const naming = Object.entries(sources).filter(([, source]) => /illumination/i.test(source));
    expect(naming.map(([file]) => file)).toContain('/src/components/campaign/GmLightControls.tsx');
    const others = naming.flatMap(([file, source]) =>
      shownText(file, source).flatMap((text) =>
        [...text.matchAll(/global illumination/gi)].filter((m) => m[0] !== 'Global Illumination').map((m) => `${file}: ${m[0]}`)));
    expect(others).toEqual([]);
  });
});
