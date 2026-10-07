/**
 * What a multipart body may say about its text fields, for every upload route.
 *
 * Multer builds `req.body` from field names written like `a[b][c]` or
 * `items[3]`, and applies no ceiling to them unless asked. A name such as
 * `a[4294967294]` makes an array with four billion slots, and the next field
 * called `a[b]` makes the server walk every one of them before it can answer
 * anyone else. No route here reads anything but plain names (`type`, `scope`,
 * `campaignName`, `confirm`, and so on, at most a dozen to a request), so
 * these are far above anything a real client sends. A body that exceeds one is
 * refused with a 400 before it is parsed any further.
 *
 * Spread into the `limits` of each multer instance; keep them in one place so
 * a new upload route cannot be added without them.
 */
export const MULTIPART_FIELD_LIMITS = {
  /** Longest field name, in bytes. The longest real one is eighteen. */
  fieldNameSize: 100,
  /** Deepest bracket nesting in a name. Real names have none. */
  fieldNestingDepth: 5,
  /** Highest number allowed between brackets. Real names have none. */
  fieldArrayIndexLimit: 1000,
  /** Most text fields in one request. Real requests have about ten. */
  fields: 100,
} as const;
