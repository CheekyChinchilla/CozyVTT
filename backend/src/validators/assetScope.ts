import { z } from 'zod';

/**
 * The body of PATCH /api/assets/:id/scope. A campaign id is needed only when
 * the new scope is CAMPAIGN, which the route checks with the campaign itself.
 */
export const UpdateAssetScopeSchema = z.object({
  scope: z.enum(['GLOBAL', 'USER', 'CAMPAIGN'], { error: 'scope must be GLOBAL, USER, or CAMPAIGN' }),
  campaignId: z.string().uuid('campaignId must be a campaign id').nullish(),
});

export type UpdateAssetScopeInput = z.infer<typeof UpdateAssetScopeSchema>;
