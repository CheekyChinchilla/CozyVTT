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
import { CAMPAIGN_LIMITS } from './campaignLimits';

/** POST /api/campaigns */
export const CreateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(CAMPAIGN_LIMITS.maxNameLength, `Campaign name must be ${CAMPAIGN_LIMITS.maxNameLength} characters or fewer`),
  description: z.string().max(CAMPAIGN_LIMITS.maxDescriptionLength).optional(),
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

/** A period's colour, filter and track, as every writer reads them. */
const vibePeriodLook = {
  hue: z.string().regex(HEX_COLOR_PATTERN, 'A period hue must be a #RRGGBB colour'),
  // `abort` stops the check after it on an over-long value. Without it, Zod
  // runs every check in the chain whether or not an earlier one failed.
  filter: z
    .string()
    .max(200, { abort: true })
    .refine(isSafeVibeFilter, 'A period filter may only use brightness(), saturate(), contrast() and hue-rotate()'),
  // An asset id, or none. A period sent without one has none.
  audio: z.string().max(500).nullable().optional().transform((audio) => audio ?? null),
};

/** One atmosphere period, as the period editor makes it. */
export const VibePeriodSchema = z.object({
  name: z.string().trim()
    .min(1, 'A period needs a name')
    .max(CAMPAIGN_LIMITS.maxVibePeriodNameLength, `A period's name may be at most ${CAMPAIGN_LIMITS.maxVibePeriodNameLength} characters`),
  ...vibePeriodLook,
}).strip();

/**
 * A campaign's atmosphere settings, as both settings routes save them
 * (`PUT /campaigns/:id/vibe` and `PUT /campaigns/:id`, through saveVibeSettings
 * in services/vibeSave.ts). `periods` is the part with a fixed shape; other
 * keys are stored as sent, which is why they pass through here, except
 * atmosphere audio, which the save keeps as stored.
 */
export const VibeSettingsSchema = z.object({
  enabled: z.boolean({ error: 'enabled must be true or false' }).optional(),
  periods: z.array(VibePeriodSchema)
    .min(1, 'A campaign needs at least one vibe period')
    .max(CAMPAIGN_LIMITS.maxVibePeriods, `A campaign may have at most ${CAMPAIGN_LIMITS.maxVibePeriods} vibe periods`)
    .refine(
      (periods) => new Set(periods.map((p) => p.name.toLowerCase())).size === periods.length,
      'Each vibe period needs a different name'
    ),
}).passthrough();

export type VibeSettingsInput = z.output<typeof VibeSettingsSchema>;

/**
 * Vibe settings as a campaign import reads them: the same look for each
 * period, without the editor's rules on names and counts, so an archive from
 * an older version keeps its periods.
 */
export const ImportVibeSettingsSchema = z.object({
  periods: z.array(z.object({ name: z.string().max(100), ...vibePeriodLook }).strip()).max(CAMPAIGN_LIMITS.maxVibePeriods),
}).passthrough();

const COOLDOWN_MESSAGE = 'chatCooldownSeconds must be an integer between 1 and 300';

/**
 * The statuses settings may set, between sessions. ACTIVE, PAUSED and
 * INACTIVE say where a session is, so only the session routes set them: one
 * set here put the campaign page out of step with its sessions.
 */
const SETTABLE_STATUSES = [CampaignStatus.PREPARATION, CampaignStatus.COMPLETED, CampaignStatus.ARCHIVED] as const;

/** PUT /api/campaigns/:campaignId. Every field optional; each is checked when present. */
export const UpdateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(CAMPAIGN_LIMITS.maxNameLength, `Campaign name must be ${CAMPAIGN_LIMITS.maxNameLength} characters or fewer`).optional(),
  description: z.string().max(CAMPAIGN_LIMITS.maxDescriptionLength, `Description must be ${CAMPAIGN_LIMITS.maxDescriptionLength} characters or fewer`).nullable().optional(),
  status: z.enum(SETTABLE_STATUSES, {
    error: `Invalid status. Must be one of: ${SETTABLE_STATUSES.join(', ')}; starting, pausing and ending a session set the others`,
  }).optional(),
  gameSystem: z.nativeEnum(GameSystem, {
    error: `Invalid game system. Must be one of: ${Object.values(GameSystem).join(', ')}`,
  }).nullish(),
  vibeSettings: VibeSettingsSchema.optional(),
  spiritLayerEnabled: z.boolean({ error: 'spiritLayerEnabled must be true or false' }).optional(),
  spiritLayerStyle: z.string({ error: 'spiritLayerStyle must be a string' }).max(100, { abort: true })
    .regex(SPIRIT_STYLE_PATTERN, 'spiritLayerStyle must be wispy, ethereal, shadow, dream, or custom:#RRGGBB with an optional :<look>')
    .optional(),
  chatCooldownEnabled: z.boolean({ error: 'chatCooldownEnabled must be true or false' }).optional(),
  chatCooldownSeconds: z.number({ error: COOLDOWN_MESSAGE }).int(COOLDOWN_MESSAGE).min(1, COOLDOWN_MESSAGE).max(300, COOLDOWN_MESSAGE).optional(),
});

export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
