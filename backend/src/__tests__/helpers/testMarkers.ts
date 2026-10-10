/**
 * Where a TODO marker for the test area sits in a test file, across both
 * packages. See testMarkers.test.ts for why it is not allowed.
 */

import fs from 'fs';
import path from 'path';

/** The folders that hold source and tests, relative to the repository root. */
const SCANNED = ['backend/src', 'frontend/src', 'frontend/e2e'];

const MARKER = /TODO\(test\)/i;

/** A test, or a file only tests use: setup, helpers, fixtures. */
export function isTestFile(relativePath: string): boolean {
  const p = relativePath.split(path.sep).join('/');
  return (
    /(^|\/)__tests__\//.test(p) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) ||
    /^frontend\/src\/test\//.test(p) ||
    /^frontend\/e2e\//.test(p)
  );
}

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every `file:line` under `root` where a test file carries the marker. */
export function testMarkerLocations(root: string): string[] {
  const found: string[] = [];
  for (const folder of SCANNED) {
    for (const file of filesUnder(path.join(root, folder))) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (!isTestFile(rel)) continue;
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (MARKER.test(line)) found.push(`${rel}:${i + 1}`);
        });
    }
  }
  return found;
}
