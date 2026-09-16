// ============================================
// Campaign request-body schemas.
// Replaces hand-rolled typeof checks on the create route with a Zod schema.
// On failure the route returns the same { error, message } 400 shape it
// always has, using the first issue's message.
// ============================================

import { z } from 'zod';
import { CampaignStatus } from '@prisma/client';
import { GameSystem } from '../game-systems';

/** POST /api/campaigns */
export const CreateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(200, 'Campaign name must be 200 characters or fewer'),
  description: z.string().max(5000).optional(),
  gameSystem: z.nativeEnum(GameSystem).nullish(),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

/** PUT /api/campaigns/:campaignId/dm */
export const TransferDMSchema = z.object({
  userId: z.string().uuid('A campaign member must be named by their user id'),
});

export type TransferDMInput = z.infer<typeof TransferDMSchema>;

/** One atmosphere period: a named hue and filter, with optional audio. */
export const VibePeriodSchema = z.object({
  name: z.string().max(100),
  hue: z.string().max(50),
  filter: z.string().max(200),
  audio: z.string().max(500).nullable().optional(),
}).strip();

/**
 * A campaign's atmosphere settings. `periods` is the part with a fixed shape.
 * The rest (the current period, atmosphere audio) is stored as sent, which is
 * why unknown keys pass through here. Shared with the campaign importer so
 * the two agree on what a period looks like.
 */
export const VibeSettingsSchema = z.object({
  periods: z.array(VibePeriodSchema).max(20),
}).passthrough();

const COOLDOWN_MESSAGE = 'chatCooldownSeconds must be an integer between 1 and 300';

/** PUT /api/campaigns/:campaignId. Every field optional; each is checked when present. */
export const UpdateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(200, 'Campaign name must be 200 characters or fewer').optional(),
  description: z.string().max(5000, 'Description must be 5000 characters or fewer').nullable().optional(),
  status: z.nativeEnum(CampaignStatus, {
    error: `Invalid status. Must be one of: ${Object.values(CampaignStatus).join(', ')}`,
  }).optional(),
  gameSystem: z.nativeEnum(GameSystem, {
    error: `Invalid game system. Must be one of: ${Object.values(GameSystem).join(', ')}`,
  }).nullish(),
  vibeSettings: VibeSettingsSchema.optional(),
  spiritLayerEnabled: z.boolean({ error: 'spiritLayerEnabled must be true or false' }).optional(),
  spiritLayerStyle: z.string({ error: 'spiritLayerStyle must be a string' }).max(100).optional(),
  chatCooldownEnabled: z.boolean({ error: 'chatCooldownEnabled must be true or false' }).optional(),
  chatCooldownSeconds: z.number({ error: COOLDOWN_MESSAGE }).int(COOLDOWN_MESSAGE).min(1, COOLDOWN_MESSAGE).max(300, COOLDOWN_MESSAGE).optional(),
});

export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
