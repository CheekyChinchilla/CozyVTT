/**
 * Which tool owns the map's presses and keys: Paint over Draw over a DM
 * tool, and none of them leaves the map to the token tool and the rest.
 */

import { describe, it, expect } from 'vitest';
import { mapInputOwner } from '../inputOwner';

describe('the owner of the map\'s input', () => {
  it.each([
    [{ painting: true, drawing: true, dmTool: true }, 'paint'],
    [{ painting: true, drawing: false, dmTool: false }, 'paint'],
    [{ painting: false, drawing: true, dmTool: true }, 'draw'],
    [{ painting: false, drawing: false, dmTool: true }, 'dm-tool'],
    [{ painting: false, drawing: false, dmTool: false }, null],
  ] as const)('of %o is %s', (state, owner) => {
    expect(mapInputOwner(state)).toBe(owner);
  });
});
