/**
 * Jest stand-in for the ESM-only `file-type` package.
 *
 * `file-type` v17+ ships no CommonJS build, so ts-jest's CJS transform fails
 * to resolve it — any suite that (transitively) imports fileValidation.ts or
 * campaignImporter.ts would crash at module load. Mapped in jest.config.js
 * via moduleNameMapper.
 *
 * No current test exercises real magic-byte validation. If one ever does,
 * this loud failure points straight here — stub the specific return value
 * with jest.mocked()/mockImplementation in that test instead of relying on
 * this placeholder.
 */
export function fileTypeFromFile(): never {
  throw new Error(
    'file-type mock called — this test needs a real stub (mock fileTypeFromFile in the test)'
  );
}

export function fileTypeFromBuffer(): never {
  throw new Error(
    'file-type mock called — this test needs a real stub (mock fileTypeFromBuffer in the test)'
  );
}
