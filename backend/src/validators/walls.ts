import { z } from 'zod';

export const WallSegmentSchema = z.object({
  id: z.string().uuid(),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  type: z.enum(['wall', 'door-closed', 'door-open', 'door-locked', 'window']),
});

export const WallSegmentsArraySchema = z
  .array(WallSegmentSchema)
  .max(5000, 'Maximum 5000 wall segments per map');

// ── Light Sources ────────────────────────────────────────────────────────────

/** Base shape for a light source (without cross-field refinement). */
const LightSourceBaseShape = z.object({
  id: z.string().uuid(),
  x: z.number().finite(),
  y: z.number().finite(),
  brightRadius: z.number().min(0).max(100),
  dimRadius: z.number().min(0.5).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  enabled: z.boolean(),
});

export const LightSourceSchema = LightSourceBaseShape.refine(
  (obj) => obj.dimRadius >= obj.brightRadius,
  { message: 'dimRadius must be >= brightRadius' }
);

export const LightSourcesArraySchema = z
  .array(LightSourceBaseShape)
  .max(200, 'Maximum 200 light sources per map')
  .superRefine((lights, ctx) => {
    for (let i = 0; i < lights.length; i++) {
      if (lights[i].dimRadius < lights[i].brightRadius) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Light at index ${i}: dimRadius must be >= brightRadius`,
          path: [i, 'dimRadius'],
        });
      }
    }
  });

/** Partial schema for PATCH updates — all fields optional except id. */
export const LightSourceUpdateSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  brightRadius: z.number().min(0).max(100).optional(),
  dimRadius: z.number().min(0.5).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  enabled: z.boolean().optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field must be provided' });

// ── Fog Operations ───────────────────────────────────────────────────────────

export const FogOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('reveal'),
    cells: z.array(z.number().int().nonnegative()),
  }),
  z.object({
    op: z.literal('hide'),
    cells: z.array(z.number().int().nonnegative()),
  }),
  z.object({ op: z.literal('reveal_all') }),
  z.object({ op: z.literal('hide_all') }),
]);
