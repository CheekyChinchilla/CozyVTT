/**
 * The shared vision scenarios, run against the rule the client draws by.
 *
 * The same file runs in the backend suite against the server's token filter.
 * Here each sample point is checked for its tier, and every token is checked
 * to be seen exactly when the server would send it.
 */

import { describe, it, expect } from 'vitest';
import fixture from '../__fixtures__/vision-scenarios.json';
import { computeVisibility, isPointVisible } from '../raycasting';
import { tierAt, isSeen, type Viewer, type Lit, type InsideFn } from '../visibilityRule';
import type { WallSegment } from '@/types/walls';

const { width, height, gridSize } = fixture.map;
const mapW = width * gridSize;
const mapH = height * gridSize;
const inside: InsideFn = (p, poly) => poly.points.length >= 3 && isPointVisible(p, poly);

type ScenarioToken = (typeof fixture.scenarios)[number]['tokens'][number] & { controlledBy?: string; sightRadius?: number; size?: { width: number; height: number } };

// Token grid coordinates count y from the bottom row; pixels count from the top.
const centre = (t: ScenarioToken) => {
  const w = t.size?.width ?? 1;
  const h = t.size?.height ?? 1;
  return { x: (t.x + w / 2) * gridSize, y: (height - 1 - t.y + h / 2) * gridSize, w, h };
};

describe('vision scenarios (client: tiers and what is seen)', () => {
  it.each(fixture.scenarios.map((s) => [s.name, s] as const))('%s', (_name, s) => {
    const walls = s.walls as WallSegment[];
    const mine = (s.tokens as ScenarioToken[]).filter((t) => t.controlledBy === fixture.viewer);
    const viewers: Viewer[] = mine.map((t) => {
      const c = centre(t);
      return {
        cx: c.x, cy: c.y,
        sight: computeVisibility({ x: c.x, y: c.y }, walls, mapW, mapH, 0),
        darkvisionPx: (t.sightRadius ?? 0) * gridSize,
        selfPx: (Math.max(c.w, c.h) / 2) * gridSize,
      };
    });
    const lits: Lit[] = s.lights.map((l) => ({
      cx: l.x, cy: l.y,
      reach: computeVisibility({ x: l.x, y: l.y }, walls, mapW, mapH, l.dimRadius * gridSize),
      brightPx: l.brightRadius * gridSize,
      dimPx: l.dimRadius * gridSize,
    }));

    for (const sample of s.samples) {
      expect({ ...sample, got: tierAt({ x: sample.x, y: sample.y }, viewers, lits, s.globalIllumination, inside) })
        .toEqual({ ...sample, got: sample.tier });
    }
    for (const t of s.tokens as ScenarioToken[]) {
      const c = centre(t);
      const seen = t.controlledBy === fixture.viewer || isSeen({ x: c.x, y: c.y }, viewers, lits, s.globalIllumination, inside);
      expect({ token: t.id, seen }).toEqual({ token: t.id, seen: s.expectVisible.includes(t.id) });
    }
  });
});
