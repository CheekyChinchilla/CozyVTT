/**
 * The About CozyVTT window: the version and licence, where the source code
 * is, and the credits the game rules' licences ask for wherever the rules are
 * used.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AboutButton, SOURCE_CODE_URL } from '../AboutDialog';
import { COZYVTT_ORC_STATEMENTS, GAME_CONTENT_NOTICES, INDEPENDENT_PRODUCT } from '@/constants/gameContentNotices';
import { waitForDialogFocus } from '@/test/dialogFocus';
import { version } from '../../../../package.json';

/**
 * The app's source files, tests left out by name as the glob cannot, with
 * the page that loads them and the build's settings.
 */
const SOURCES = Object.entries(
  import.meta.glob(['/src/**/*.{ts,tsx,js,jsx}', '!/src/**/__tests__/**', '/index.html', '/vite.config.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
).filter(([file]) => !file.includes('/__tests__/') && !file.includes('.test.'));

/**
 * A file that brings the version in: one naming package.json in any import
 * or read, with a query such as `?raw` or `?url` too, or the version npm
 * passes to a script it runs. A name in backticks counts only as what
 * `import(` loads, since a comment writes a file's name in Markdown code.
 */
const BRINGS_THE_VERSION = /package\.json(?:\?[^'"`\s]*)?['"]|import\(\s*`[^`]*package\.json(?:\?[^`\s]*)?`|npm_package_version/;

/**
 * The build's settings as Vite works them out for `command`. The file is
 * the Node project's (tsconfig.node.json), so it is loaded by a path the
 * browser project does not compile, and its export is checked as it runs.
 */
async function buildSettings(command: 'build' | 'serve'): Promise<{ define?: unknown; envPrefix?: unknown }> {
  const file = '../../../../vite.config.ts';
  const loaded: unknown = await import(/* @vite-ignore */ file);
  const make = loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : undefined;
  if (typeof make !== 'function') throw new Error('vite.config.ts exports no settings function');
  const settings: unknown = await make({ command, mode: command === 'build' ? 'production' : 'development', isSsrBuild: false, isPreview: false });
  if (!settings || typeof settings !== 'object') throw new Error('vite.config.ts gave no settings');
  return settings;
}

/** Every web address written out in full in a line, without the punctuation after it. */
const addressesIn = (line: string) =>
  line.split(/\s+/).filter((word) => word.includes('https://')).map((word) => word.replace(/^\(/, '').replace(/[).,;:]+$/, ''));

/** Opens the window from its button; returns both. */
async function openAbout() {
  render(<AboutButton />);
  const opener = screen.getByRole('button', { name: 'About CozyVTT' });
  await userEvent.click(opener);
  const dialog = await waitForDialogFocus(screen.getByRole('dialog', { name: 'About CozyVTT' }));
  return { opener, dialog };
}

/** A paragraph whose whole text, links included, is `text`. */
const paragraph = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === 'P' && element.textContent === text;

describe('the About CozyVTT window', () => {
  it("lists each game system's credit lines under the system's name", async () => {
    const { dialog } = await openAbout();

    expect(GAME_CONTENT_NOTICES).toHaveLength(3);
    for (const { system, lines } of GAME_CONTENT_NOTICES) {
      const part = within(dialog).getByRole('region', { name: system });
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(within(part).getByText(paragraph(line))).toBeInTheDocument();
      }
    }
  });

  it("shows CozyVTT's own statements the ORC licence asks for, and that it is independent of any publisher", async () => {
    const { dialog } = await openAbout();

    const own = within(dialog).getByRole('region', { name: "CozyVTT's own material" });
    for (const line of COZYVTT_ORC_STATEMENTS) {
      expect(within(own).getByText(paragraph(line))).toBeInTheDocument();
    }
    expect(within(dialog).getByText(paragraph(INDEPENDENT_PRODUCT))).toBeInTheDocument();
  });

  it('names the licence and links the source code', async () => {
    const { dialog } = await openAbout();

    expect(within(dialog).getByRole('link', { name: 'GNU Affero General Public License v3.0' }))
      .toHaveAttribute('href', 'https://www.gnu.org/licenses/agpl-3.0.html');
    expect(within(dialog).getByRole('link', { name: 'Source code' })).toHaveAttribute('href', SOURCE_CODE_URL);
  });

  // The notices the AGPL-3.0 asks a program with a user interface to show:
  // that the user may pass it on under the licence, that it comes with no
  // warranty, and where the licence is.
  it("gives the licence's notices: free to pass on and change, with no warranty", async () => {
    const { dialog } = await openAbout();

    expect(within(dialog).getByText(paragraph(
      'CozyVTT is free software: you can redistribute it and modify it under the terms of the GNU Affero General Public License v3.0, as published by the Free Software Foundation.'
    ))).toBeInTheDocument();
    expect(within(dialog).getByText(paragraph(
      'CozyVTT is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.'
    ))).toBeInTheDocument();
  });

  // The open rules' material is under the rules' own licences.
  it('says only the open game rules the sheets draw on are under their own licences', async () => {
    const { dialog } = await openAbout();

    expect(within(dialog).getByText(paragraph(
      "The open game rules CozyVTT's sheets draw on are not under its licence. Each is credited here as its own licence asks."
    ))).toBeInTheDocument();
  });

  // The sign-in page is public, and an exact version tells a stranger which
  // instances have not taken a fix.
  it("does not show CozyVTT's version", async () => {
    const { dialog } = await openAbout();

    expect(dialog.textContent).not.toContain(version);
    expect(dialog.textContent).not.toMatch(/\bversion\b/i);
  });

  it('is not how the version reaches the page: no source file and no build setting brings package.json in', () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    expect(SOURCES.map(([file]) => file)).toEqual(expect.arrayContaining(['/index.html', '/vite.config.ts']));
    expect(SOURCES.filter(([, text]) => BRINGS_THE_VERSION.test(text)).map(([file]) => file)).toEqual([]);
  });

  it('finds package.json brought in any way a file could', () => {
    for (const line of [
      "import pkg from '../package.json';",
      'import pkg from "../../package.json?raw";',
      "const where = new URL('../package.json?url', import.meta.url);",
      'const pkg = await import(`../package.json`);',
      "const { version } = JSON.parse(readFileSync('package.json', 'utf8'));",
      'define: { __VERSION__: JSON.stringify(process.env.npm_package_version) },',
    ]) {
      expect(line).toMatch(BRINGS_THE_VERSION);
    }
    expect('the package.json files are left alone').not.toMatch(BRINGS_THE_VERSION);
    // A comment naming the file in Markdown code brings nothing in.
    expect('// No source file imports `package.json`, so the version stays out.').not.toMatch(BRINGS_THE_VERSION);
  });

  // A constant the build puts into the bundle, or an environment variable it
  // passes to the page, could carry the version without naming package.json.
  // npm sets npm_package_version for a script it runs, `npm run build` too.
  it('is not how the version reaches the page: the build defines no constant holding it and passes npm\'s variables to none', async () => {
    vi.stubEnv('npm_package_version', version);
    try {
      for (const command of ['build', 'serve'] as const) {
        const settings = await buildSettings(command);
        expect(JSON.stringify(settings.define ?? {})).not.toContain(version);
        const prefixes = [settings.envPrefix ?? 'VITE_'].flat();
        expect(prefixes.filter((prefix) => typeof prefix !== 'string' || 'npm_package_version'.startsWith(prefix))).toEqual([]);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('makes each web address in a credit a link that opens in a new tab', async () => {
    const { dialog } = await openAbout();

    const addresses = [...GAME_CONTENT_NOTICES.flatMap(({ lines }) => lines), ...COZYVTT_ORC_STATEMENTS].flatMap(addressesIn);
    expect(addresses.length).toBeGreaterThanOrEqual(5);
    for (const address of new Set(addresses)) {
      for (const link of within(dialog).getAllByRole('link', { name: address })) {
        expect(link).toHaveAttribute('href', address);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
    }
  });

  it('closes on Escape and gives the focus back to the button that opened it', async () => {
    const { opener } = await openAbout();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('closes from its Close button, with the focus back on the opener', async () => {
    const { opener, dialog } = await openAbout();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('is a button a finger can hit', () => {
    render(<AboutButton />);
    expect(screen.getByRole('button', { name: 'About CozyVTT' })).toHaveClass('touch-target');
  });
});
