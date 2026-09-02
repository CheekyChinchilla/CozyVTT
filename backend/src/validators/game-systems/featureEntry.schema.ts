/**
 * A named feature with an optional description.
 *
 * D&D 5e keeps these in `featuresAndTraits` and Pathfinder 2e in
 * `classFeatures`. Both used to be a bare list of names, while the built-in
 * templates wrote full rules text — Second Wind, Attack of Opportunity, Shield
 * Block — into separate fields that nothing read, so none of it was ever shown.
 *
 * Declared once and imported by both schemas, so the two systems cannot end up
 * with different ideas of what a feature is.
 */

import { z } from 'zod';

/**
 * Accepts either shape.
 *
 * A plain string is every sheet written before descriptions existed, and every
 * exported JSON sitting in someone's backups. It becomes the name, whole, with
 * an empty description. It is never split on punctuation to invent one: players
 * type "NakuDama-Amphibious" and "Fighting Style: Defense", and a rule clever
 * enough to find a description in the second would wreck the first.
 */
export const featureEntrySchema = z.union([
  z.string().transform((name) => ({ name: name.trim(), description: '' })),
  z.object({
    name: z.string().min(1),
    description: z.string().default(''),
  }),
]);
