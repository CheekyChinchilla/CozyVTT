/**
 * The environment every test file runs in: Node's, which removes the file's
 * temporary uploads folder (jest.setup.ts) once the file has ended.
 *
 * An afterAll in jest.afterEnv.ts ran before the file's own afterAll hooks,
 * so a file that cleaned up its uploads found them gone already. teardown()
 * runs after every hook of the file.
 */

import NodeEnvironment from 'jest-environment-node';
import { removeUploadsFolder } from './testUploads';

export default class TestEnvironment extends NodeEnvironment {
  override async teardown(): Promise<void> {
    const uploads = (this.global as { __testUploadsFolder?: unknown }).__testUploadsFolder;
    if (typeof uploads === 'string') removeUploadsFolder(uploads);
    await super.teardown();
  }
}
