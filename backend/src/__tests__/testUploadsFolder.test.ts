/**
 * A test file that sets no UPLOAD_DIR of its own uploads into a temporary
 * folder of its own, never into the real backend/uploads, where full runs
 * used to leave hundreds of files (helpers/jest.setup.ts makes the folder,
 * helpers/jest.afterEnv.ts removes it).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getUploadsDirectory } from '../utils/fileUtils';

/** Whether `dir` lies inside `parent`, below it. */
function inside(dir: string, parent: string): boolean {
  const rel = path.relative(parent, dir);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

describe('the uploads folder in a test file that sets none', () => {
  it('lies under the system temporary folder, apart from backend/uploads', () => {
    const uploads = getUploadsDirectory();
    expect(inside(uploads, os.tmpdir()) || inside(uploads, fs.realpathSync(os.tmpdir()))).toBe(true);
    expect(uploads).not.toBe(path.resolve(__dirname, '../../uploads'));
    expect(fs.statSync(uploads).isDirectory()).toBe(true);
  });
});
