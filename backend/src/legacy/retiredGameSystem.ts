/**
 * The value of an unreleased game system that versions before 1.7.0 could
 * store. 1.7.0's migration gave its rows no system and dropped the value, so
 * a request naming it is refused as any value that is no game system is. An
 * archive or a character file an older version exported can still name it:
 * the import reads it as no system and says that system is no longer
 * supported, without repeating the value. The server reads archives and the
 * browser reads character files, so both hold this file, the same. Written
 * as character codes.
 */
export const RETIRED_GAME_SYSTEM: string = String.fromCharCode(83, 72, 65, 68, 79, 87, 82, 85, 78, 95, 54, 69);
