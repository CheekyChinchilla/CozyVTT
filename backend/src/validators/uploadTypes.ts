// ============================================
// The files each kind of asset may be uploaded as
// ============================================
//
// The same file in the browser and on the server; keepInStep.test.ts fails if
// they differ. The server decides by a file's own bytes and stores it as one
// of the content types below. The upload dialog has only the file's name and
// the type the browser guesses, which differs between browsers (Firefox calls
// an Ogg file application/ogg and a WAV audio/x-wav, and Markdown often has
// none), so it checks the name's extension against the extensions below.

export type UploadAssetType = 'MAP' | 'TOKEN' | 'AUDIO' | 'AVATAR' | 'DOCUMENT' | 'OTHER';

/** The content types the server stores each kind of asset as. */
export const UPLOAD_CONTENT_TYPES = {
  MAP: ['image/png', 'image/jpeg', 'image/webp'],
  TOKEN: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  AUDIO: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
  AVATAR: ['image/png', 'image/jpeg', 'image/webp'],
  DOCUMENT: ['application/pdf', 'text/plain', 'text/markdown'],
  OTHER: [],
} as const satisfies Record<UploadAssetType, readonly string[]>;

/** The extensions a file of each kind may be named with. */
export const UPLOAD_EXTENSIONS = {
  MAP: ['.png', '.jpg', '.jpeg', '.webp'],
  TOKEN: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
  AUDIO: ['.mp3', '.ogg', '.wav'],
  AVATAR: ['.png', '.jpg', '.jpeg', '.webp'],
  DOCUMENT: ['.pdf', '.txt', '.md'],
  OTHER: [],
} as const satisfies Record<UploadAssetType, readonly string[]>;
