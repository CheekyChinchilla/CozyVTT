/**
 * Runs inside every test file, after jest's own hooks are installed.
 *
 * Hands jest.environment.ts what the file does once its last hook has run
 * (testFileEnd.ts): the environment runs outside the file's module registry,
 * and reaches it only through the file's global object. What that end uses
 * is loaded in an afterAll, while Jest still loads modules for the file.
 */
import { holdTestFileEnd, endHeldTestFile } from './testFileEnd';

afterAll(() => {
  holdTestFileEnd();
});

globalThis.__endTestFile = endHeldTestFile;
