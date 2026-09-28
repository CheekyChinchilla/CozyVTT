import { readFileSync } from 'fs';
import path from 'path';
import { systemsCompatible } from '../gameSystemCompatibility';

describe('systemsCompatible', () => {
  it.each([
    ['DND_5E', 'DND_5E'],
    ['PATHFINDER_2E', 'PATHFINDER_2E'],
    [null, null],
    [undefined, null],
  ])('lets a %s character join a %s campaign', (character, campaign) => {
    expect(systemsCompatible(character, campaign)).toBe(true);
  });

  it.each([
    [null, 'DND_5E'],
    ['DND_5E', null],
    ['PATHFINDER_2E', 'DND_5E'],
    ['CALL_OF_CTHULHU_7E', undefined],
  ])('keeps a %s character out of a %s campaign', (character, campaign) => {
    expect(systemsCompatible(character, campaign)).toBe(false);
  });
});

describe('parity with the frontend copy', () => {
  // The server decides who may join; the browser decides what it offers. If
  // the two disagree, a character is offered and then refused.
  it('is byte-for-byte identical to frontend/src/utils/gameSystemCompatibility.ts', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../gameSystemCompatibility.ts'), 'utf8');
    const frontendCopy = readFileSync(path.resolve(__dirname, '../../../../frontend/src/utils/gameSystemCompatibility.ts'), 'utf8');
    expect(backendCopy).toBe(frontendCopy);
  });
});
