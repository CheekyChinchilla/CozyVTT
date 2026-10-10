/**
 * No test file carries a TODO marker for the test area.
 *
 * A test known to be flaky or wrong once sat with such a marker and no one
 * assigned to it, until it failed a release's CI run. A marker in a test file
 * is now a failure here, so the test is fixed, or the problem reported,
 * before the change lands. Markers for other areas, which point at the code
 * a test exercises, are allowed.
 *
 * The marker is spelled out with a pattern so that this file does not
 * contain it.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { testMarkerLocations, isTestFile } from './helpers/testMarkers';

const root = path.resolve(__dirname, '../../..');
const marker = ['TODO', '(test)'].join('');

it('finds no marker in any test file of either package', () => {
  // Each entry is file:line. Fix the test the marker is on, or report what is
  // wrong with it, and remove the marker.
  expect(testMarkerLocations(root)).toEqual([]);
});

describe('the scan', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-markers-'));
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    };
    write('backend/src/routes/__tests__/a.e2e.test.ts', `it('x', () => {});\n// ${marker}: flaky on CI\n`);
    write('backend/src/utils/b.test.ts', `// ${marker.toLowerCase()} lower case is the same marker\n`);
    write('frontend/src/components/__tests__/C.test.tsx', `/* ${marker} */\n`);
    write('frontend/src/test/setup.ts', `// ${marker}\n`);
    write('frontend/src/components/D.tsx', `// ${marker}: not a test file, so not reported\n`);
    write('backend/src/routes/e.ts', '// TODO(maps): another area\n');
    write('frontend/node_modules/pkg/x.test.ts', `// ${marker}\n`);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reports each marker in a test file, with its line, and nothing else', () => {
    expect(testMarkerLocations(dir).sort()).toEqual([
      'backend/src/routes/__tests__/a.e2e.test.ts:2',
      'backend/src/utils/b.test.ts:1',
      'frontend/src/components/__tests__/C.test.tsx:1',
      'frontend/src/test/setup.ts:1',
    ]);
  });

  it.each([
    ['backend/src/routes/__tests__/helpers.ts', true],
    ['backend/src/__tests__/helpers/db.ts', true],
    ['frontend/src/utils/x.test.ts', true],
    ['frontend/src/utils/x.spec.tsx', true],
    ['frontend/src/test/setup.ts', true],
    ['frontend/src/utils/x.ts', false],
    ['backend/src/server.ts', false],
  ])('treats %s as a test file: %s', (rel, expected) => {
    expect(isTestFile(rel)).toBe(expected);
  });
});
