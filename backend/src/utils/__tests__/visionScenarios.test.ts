/**
 * The shared vision scenarios, run against the server's token filter.
 *
 * The same file runs in the frontend suite against the rule and the mask.
 * A scenario added to one copy fails the parity test until it is added to
 * the other, and a scenario the two packages answer differently fails here
 * or there. That is what keeps "what is sent" and "what is drawn" the same.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { filterTokensByLighting } from '../spirit-layer';
import type { Token } from '../../websocket/shared';

interface ScenarioToken { id: string; x: number; y: number; controlledBy?: string; sightRadius?: number; size?: { width: number; height: number } }
interface Scenario {
  name: string;
  globalIllumination: boolean;
  walls: Array<{ id: string; x1: number; y1: number; x2: number; y2: number; type: string }>;
  lights: Array<{ id: string; x: number; y: number; brightRadius: number; dimRadius: number; enabled: boolean }>;
  tokens: ScenarioToken[];
  expectVisible: string[];
}
interface Fixture { map: { width: number; height: number; gridSize: number }; viewer: string; scenarios: Scenario[] }

const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../__fixtures__/vision-scenarios.json'), 'utf8')) as Fixture;

function toToken(t: ScenarioToken): Token {
  return {
    id: t.id, name: t.id, imageUrl: '', position: { x: t.x, y: t.y },
    size: t.size ?? { width: 1, height: 1 }, layer: 'token', visible: true,
    controlledBy: t.controlledBy ?? null, rotation: 0, conditions: [], metadata: {},
    sightRadius: t.sightRadius ?? 0,
  } as unknown as Token;
}

describe('vision scenarios (server: which tokens are sent)', () => {
  it.each(fixture.scenarios.map((s) => [s.name, s] as const))('%s', (_name, s) => {
    const { width, height, gridSize } = fixture.map;
    const sent = filterTokensByLighting(
      s.tokens.map(toToken), fixture.viewer, s.walls, width, height, gridSize, true, s.lights, s.globalIllumination
    );
    expect(sent.map((t) => t.id).sort()).toEqual([...s.expectVisible].sort());
  });
});
