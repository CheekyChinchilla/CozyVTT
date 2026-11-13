/**
 * Which tool owns the map's presses and keys: Paint over Draw over a GM
 * tool, and none of them leaves the map to the token tool and the rest.
 */

import { describe, it, expect } from 'vitest';
import { mapInputOwner } from '../inputOwner';

describe('the owner of the map\'s input', () => {
  it.each([
    [{ painting: true, drawing: true, gmTool: true }, 'paint'],
    [{ painting: true, drawing: false, gmTool: false }, 'paint'],
    [{ painting: false, drawing: true, gmTool: true }, 'draw'],
    [{ painting: false, drawing: false, gmTool: true }, 'gm-tool'],
    [{ painting: false, drawing: false, gmTool: false }, null],
  ] as const)('of %o is %s', (state, owner) => {
    expect(mapInputOwner(state)).toBe(owner);
  });
});
