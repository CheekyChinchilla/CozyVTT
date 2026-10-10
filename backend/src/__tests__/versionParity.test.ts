/**
 * The version is written in several files, and nothing else compares them.
 *
 * A release bumps `version` in both projects' package.json and package-lock.json,
 * the OpenAPI document's `info.version`, the fallback in the campaign exporter
 * that is what a user sees on an exported campaign when npm did not set the
 * variable (which is the case in the production `dist/server.js`), the
 * `exportedFrom` example in the API reference, and the deployment guide's note
 * on which releases need a manual data migration. These drifted apart in the
 * past with every other check still green, because no check looked. This one
 * does: it fails the moment any of them disagrees with the backend's
 * package.json, so the next release cannot half-bump.
 */

import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const readText = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const pkgVersion = (rel: string): string => JSON.parse(readText(rel)).version;

const backendVersion = pkgVersion('backend/package.json');

describe('the version is the same everywhere it is written', () => {
  it('is a plain semver string', () => {
    expect(backendVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches the frontend package.json', () => {
    expect(pkgVersion('frontend/package.json')).toBe(backendVersion);
  });

  it.each(['backend/package-lock.json', 'frontend/package-lock.json'])(
    'matches %s, at the top and on the root package',
    (rel) => {
      const lock = JSON.parse(readText(rel)) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };
      expect({ top: lock.version, rootPackage: lock.packages?.['']?.version }).toEqual({
        top: backendVersion,
        rootPackage: backendVersion,
      });
    },
  );

  it('matches the OpenAPI document info.version', () => {
    const yaml = readText('backend/docs/API_DOCUMENTATION.yaml');
    // info.version is the first `version:` under the top-level `info:` block.
    const match = yaml.match(/^\s{2}version:\s*(\S+)\s*$/m);
    expect(match?.[1]).toBe(backendVersion);
  });

  it('matches the exported-campaign fallback', () => {
    const exporter = readText('backend/src/services/campaignExporter.ts');
    // The version a user sees when npm_package_version is unset, as it is in
    // the production build. Must be bumped by hand with the rest.
    const match = exporter.match(/npm_package_version \|\| '(\d+\.\d+\.\d+)'/);
    expect(match?.[1]).toBe(backendVersion);
  });

  it('matches the exportedFrom example in the API reference', () => {
    const reference = readText('docs/API_REFERENCE.md');
    const match = reference.match(/"exportedFrom": "CozyVTT v(\d+\.\d+\.\d+)"/);
    expect(match?.[1]).toBe(backendVersion);
  });

  it("is named in the deployment guide's note on manual data migrations", () => {
    // The note lists the releases since 1.3.0 that need no manual data step, so
    // every release has to decide whether it belongs there. A release that does
    // need a step rewrites the note, and this test with it.
    const guide = readText('docs/DEPLOYMENT.md');
    const note = guide.split('\n').find((line) => line.includes('needs a manual step here'));
    // The whole version: 1.5.1 must not pass on the strength of 1.5.10 or 11.5.1.
    const named = new RegExp(`(?<![\\d.])${backendVersion.replace(/\./g, '\\.')}(?!\\.?\\d)`);
    expect(note).toMatch(named);
  });
});
