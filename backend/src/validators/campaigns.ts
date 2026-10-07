// ============================================
// Campaign request-body schemas.
// Replaces hand-rolled typeof checks on the create route with a Zod schema.
// On failure the route returns the same { error, message } 400 shape it
// always has, using the first issue's message.
// ============================================

import { z } from 'zod';
import { CampaignStatus } from '@prisma/client';
import { GameSystem } from '../game-systems';
import { HEX_COLOR_PATTERN, SPIRIT_STYLE_PATTERN, isSafeVibeFilter } from '../utils/styleAllowlists';

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

/** The longest a campaign invitation can be set to last. */
export const MAX_INVITE_EXPIRY_DAYS = 365;

/**
 * POST /api/campaigns/:campaignId/invite. `expiresInDays` omitted, null, zero
 * or negative means the invitation never expires; otherwise it is a whole
 * number of days, up to a year. `sendEmail` is read by the route itself, since
 * anything but `true` simply means no email.
 */
export const CampaignInviteSchema = z.object({
  userId: z.string({ error: 'User ID is required' }).min(1, { error: 'User ID is required' }),
  expiresInDays: z
    .number({ error: 'expiresInDays must be a number of days' })
    .int({ error: 'expiresInDays must be a whole number of days' })
    .max(MAX_INVITE_EXPIRY_DAYS, { error: `expiresInDays must be at most ${MAX_INVITE_EXPIRY_DAYS}` })
    .nullable()
    .optional(),
});

/** One atmosphere period: a named hue and filter, with optional audio. */
export const VibePeriodSchema = z.object({
  name: z.string().max(100),
  hue: z.string().regex(HEX_COLOR_PATTERN, 'A period hue must be a #RRGGBB colour'),
  // `abort` stops the check after it on an over-long value. Without it, Zod
  // runs every check in the chain whether or not an earlier one failed.
  filter: z
    .string()
    .max(200, { abort: true })
    .refine(isSafeVibeFilter, 'A period filter may only use brightness(), saturate(), contrast() and hue-rotate()'),
  audio: z.string().max(500).nullable().optional(),
}).strip();

/**
 * A campaign's atmosphere settings. `periods` is the part with a fixed shape;
 * the rest (the current period name) is stored as sent, which is why unknown
 * keys pass through here. Atmosphere audio is not among them: the route
 * replaces whatever the client sent with what is stored, through
 * `preserveAtmosphereAudio`. Shared with the campaign importer so the two
 * agree on what a period looks like.
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
  spiritLayerStyle: z.string({ error: 'spiritLayerStyle must be a string' }).max(100)
    .regex(SPIRIT_STYLE_PATTERN, 'spiritLayerStyle must be wispy, ethereal, shadow, dream, or custom:#RRGGBB with an optional :<look>')
    .optional(),
  chatCooldownEnabled: z.boolean({ error: 'chatCooldownEnabled must be true or false' }).optional(),
  chatCooldownSeconds: z.number({ error: COOLDOWN_MESSAGE }).int(COOLDOWN_MESSAGE).min(1, COOLDOWN_MESSAGE).max(300, COOLDOWN_MESSAGE).optional(),
});

export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
