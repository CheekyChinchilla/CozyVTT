/**
 * What the shipped deployment files offer and promise, checked against what
 * CozyVTT actually supports.
 *
 * One address. The page, the API and the live connection are served from the
 * same address. The example env files used to offer VITE_API_URL and
 * VITE_SOCKET_URL for a backend on another address, and a self-hoster who
 * followed them got a page that signed in and then showed every map, token,
 * avatar, sound and document blank: the page's security policy, the
 * backend's resource policy and the canvas's anonymous image loads each
 * refuse a picture from another address. The offer is gone.
 */

import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** The settings an env file offers, set or commented out as an example. */
const offered = (rel: string) =>
  read(rel)
    .split('\n')
    .map((line) => /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);

describe('one address for the page and the backend', () => {
  it.each(['.env.example', 'frontend/.env.example'])('%s does not offer a backend on another address', (file) => {
    expect(offered(file).filter((key) => key === 'VITE_API_URL' || key === 'VITE_SOCKET_URL')).toEqual([]);
  });

  it('is not described as an option in the development guide', () => {
    expect(read('docs/DEVELOPMENT.md')).not.toMatch(/\|\s*`VITE_(API|SOCKET)_URL`\s*\|/);
  });
});
