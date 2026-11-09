/**
 * The environment every test file runs in: Node's, which ends the file once
 * its last hook has run (testFileEnd.ts), and removes the file's temporary
 * uploads folder (jest.setup.ts) once the file has ended.
 *
 * An afterAll in jest.afterEnv.ts ran before the file's own afterAll hooks,
 * so a file that cleaned up its uploads found them gone already. teardown()
 * runs after every hook of the file.
 *
 * The end runs on Jest's run_finish, which comes after every hook of the file
 * and before teardown(): by teardown() Jest has torn the file's module
 * registry down, and the end needs it to let the work under way finish.
 */

import type {} from './testFileEnd';
import NodeEnvironment from 'jest-environment-node';
import { removeUploadsFolder } from './testUploads';

export default class TestEnvironment extends NodeEnvironment {
  /**
   * A failing end is added to the file's errors: thrown, it would replace
   * the file's results with "Test suite failed to run", and its tests would
   * drop out of the counts.
   */
  async handleTestEvent(event: { name: string }, state: { unhandledErrors: unknown[] }): Promise<void> {
    if (event.name !== 'run_finish') return;
    const end = this.global.__endTestFile;
    if (typeof end !== 'function') return;
    try {
      await end();
    } catch (error) {
      state.unhandledErrors.push(error);
    }
  }

  override async teardown(): Promise<void> {
    const uploads = (this.global as { __testUploadsFolder?: unknown }).__testUploadsFolder;
    if (typeof uploads === 'string') removeUploadsFolder(uploads);
    await super.teardown();
  }
}
