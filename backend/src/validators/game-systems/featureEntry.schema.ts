/**
 * A named feature with an optional description.
 *
 * 5E keeps these in `featuresAndTraits` and Fantasy d20 in
 * `classFeatures`. Both used to be a bare list of names, while the built-in
 * templates wrote full rules text, for Second Wind and the Fantasy d20
 * Fighter's class features among others, into separate fields that nothing
 * read, so none of it was ever shown.
 *
 * Declared once and imported by both schemas, so the two systems cannot end up
 * with different ideas of what a feature is.
 */

import { z } from 'zod';
import { sheetLongTextSchema } from './sheetText';

/**
 * Accepts either shape.
 *
 * A plain string is every sheet written before descriptions existed, and every
 * exported JSON sitting in someone's backups. It becomes the name, whole, with
 * an empty description. It is never split on punctuation to invent one: players
 * type "MarshKin-Amphibious" and "Fighting Style: Defense", and a rule clever
 * enough to find a description in the second would wreck the first.
 */
export const featureEntrySchema = z.union([
  sheetLongTextSchema.transform((name) => ({ name: name.trim(), description: '' })),
  z.object({
    // The long limit, not a one-line one: an older sheet's whole line,
    // description and all, becomes the name.
    name: sheetLongTextSchema.min(1),
    description: sheetLongTextSchema.default(''),
  }),
]);
