import { readFileSync } from 'fs';
import path from 'path';

/**
 * The vision model is three files that exist once in each package. The server
 * decides which tokens to send with them; the client decides what to draw and
 * which doors to show. If the copies drift, one side is trusting the other,
 * and a token can be drawn that was never sent, or sent that is never drawn.
 * The obscured-token mask is a fourth: the server applies it before sending,
 * the DM's preview applies it to show what was sent. vibeAudio.ts is the
 * rule for what a vibe period's audio value names: the server plays by it,
 * the period editor displays by it. doorFog.ts is the rule for a door under
 * manual fog: the server refuses a toggle by it, the client offers doors by it.
 * drawingRules.ts is who may draw, erase and be sent a drawing: the server
 * refuses by it, the draw tool offers by it.
 * dice-parser.ts is the dice grammar: the server rolls by it, and a paused
 * table rolls and checks expressions by it in the browser.
 */
describe.each(['raycasting.ts', 'spatialIndex.ts', 'visibilityRule.ts', 'tokenMask.ts', 'vibeAudio.ts', 'doorFog.ts', 'drawingRules.ts', 'dice-parser.ts', '__fixtures__/vision-scenarios.json'])('%s', (file) => {
  it('is byte-for-byte identical in backend/src/utils and frontend/src/utils', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    const frontendCopy = readFileSync(path.resolve(__dirname, '../../../../frontend/src/utils', file), 'utf8');
    expect(backendCopy).toBe(frontendCopy);
  });
});
