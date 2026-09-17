import { readFileSync } from 'fs';
import path from 'path';

/**
 * The vision model is three files that exist once in each package. The server
 * decides which tokens to send with them; the client decides what to draw and
 * which doors to show. If the copies drift, one side is trusting the other,
 * and a token can be drawn that was never sent, or sent that is never drawn.
 */
describe.each(['raycasting.ts', 'spatialIndex.ts', 'visibilityRule.ts', '__fixtures__/vision-scenarios.json'])('%s', (file) => {
  it('is byte-for-byte identical in backend/src/utils and frontend/src/utils', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    const frontendCopy = readFileSync(path.resolve(__dirname, '../../../../frontend/src/utils', file), 'utf8');
    expect(backendCopy).toBe(frontendCopy);
  });
});
