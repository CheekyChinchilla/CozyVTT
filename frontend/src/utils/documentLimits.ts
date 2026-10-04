// ============================================
// Limits on a document typed into the app (not an uploaded file).
//
// The server enforces these in backend/src/validators/documents.ts; a test
// there fails if these numbers drift from it. Kept here so the dialog can
// state the same limits it will be held to.
// ============================================

/** The longest name a document may have. */
export const MAX_DOCUMENT_NAME_LENGTH = 200;

/** The most text a typed document may hold, in bytes of UTF-8. */
export const MAX_TYPED_DOCUMENT_BYTES = 900 * 1024;
