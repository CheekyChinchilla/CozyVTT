/**
 * File modes, where the platform keeps them.
 *
 * Windows ignores the mode given to mkdir, open and chmod, and stat reports
 * 0o666 or 0o777 whatever was asked, so a test of a mode could only fail
 * there. The modes these tests check are what keep a backup, and the working
 * copies of one, readable by the backend's user alone on the Linux hosts
 * CozyVTT runs on. The rest of each test still runs everywhere.
 */
import fs from 'fs/promises';

export const FILE_MODES_APPLY = process.platform !== 'win32';

/** For a describe block about modes alone. */
export const describeWhereModesApply = FILE_MODES_APPLY ? describe : describe.skip;

/** For a test about a mode alone. */
export const itWhereModesApply = FILE_MODES_APPLY ? it : it.skip;

/** Expect the bits `mask` picks out of `mode` to be `expected`, where modes apply. */
export function expectModeBits(mode: number | undefined, mask: number, expected: number): void {
  expect(mode).toBeDefined();
  if (FILE_MODES_APPLY) expect(mode! & mask).toBe(expected);
}

/** The same, for a file or folder on disk. */
export async function expectFileMode(file: string, mask: number, expected: number): Promise<void> {
  expectModeBits((await fs.stat(file)).mode, mask, expected);
}
