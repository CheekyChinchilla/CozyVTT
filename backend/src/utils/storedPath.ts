import path from 'path';

/**
 * Where a stored file is on this machine, from the path its row records.
 * Paths recorded during development on Windows have backslashes; read
 * either way, they resolve in the Linux container too.
 */
export function storedFilePath(filePath: string): string {
  return path.resolve(filePath.replace(/\\/g, '/'));
}
