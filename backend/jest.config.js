/**
 * Packages published as ES modules only, which Jest loads as CommonJS only
 * once they are compiled to it (below). Node loads them itself; Jest does so
 * only when run with --experimental-vm-modules.
 *
 * otplib (authenticator codes) is CommonJS, and loads @noble/hashes for
 * HMAC-SHA1 and @scure/base for base32. file-type, which identifies an
 * upload or a stored picture by its bytes, is an ES module, and so are the
 * four packages it reads with and the one they decode text with. archiver,
 * which writes campaign exports and instance backups, is an ES module, and so
 * are zip-stream, compress-commons and crc32-stream under it and the is-stream
 * they all check their inputs with.
 */
const ESM_ONLY = [
  '@noble/hashes',
  '@scure/base',
  'file-type',
  'strtok3',
  'token-types',
  '@tokenizer/inflate',
  'uint8array-extras',
  '@borewit/text-codec',
  'archiver',
  'zip-stream',
  'compress-commons',
  'crc32-stream',
  'is-stream',
].join('|');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  // Refuses to start against a database whose name has no "test" in it; the
  // suites write to it freely. See the file.
  globalSetup: '<rootDir>/src/__tests__/helpers/jest.globalSetup.ts',
  // Removes this run's temporary uploads folders; see the file.
  globalTeardown: '<rootDir>/src/__tests__/helpers/jest.globalTeardown.ts',
  // Caps each Prisma pool, and disconnects every file's clients when it ends,
  // so a full run stays under PostgreSQL's connection ceiling; see the files.
  setupFiles: ['<rootDir>/src/__tests__/helpers/jest.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/helpers/jest.afterEnv.ts'],
  // A worker keeps memory from one test file to the next, and over a full run
  // its heap reached Node's 4 GB default and the worker crashed. Restarting a
  // worker once it holds more than this keeps a full run well inside it.
  workerIdleMemoryLimit: '1GB',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // file-type needs no moduleNameMapper: its "exports" give one "default"
  // file, which Jest's resolver finds, and tests use the real library unless
  // they mock it. On TypeScript 6, ts-jest finds its types through the same
  // "exports" (5.9 needed a paths entry in tsconfig.json).
  // The packages in ESM_ONLY are compiled to CommonJS for the tests, so the
  // tests check codes and identify files with the real libraries.
  //
  // tsconfig.json's "module": "node20" is one ts-jest compiles as CommonJS,
  // and it warns about that on every file (code 151002) unless isolatedModules
  // is on. isolatedModules would compile each file on its own, so a dynamic
  // import() would stay a native import, which Jest cannot load without
  // --experimental-vm-modules. The warning is turned off instead.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: { ignoreCodes: [151002] } }],
    [`/node_modules/(${ESM_ONLY})/.+\\.js$`]: [
      'ts-jest',
      { tsconfig: { allowJs: true, module: 'commonjs', target: 'ES2022' }, diagnostics: false },
    ],
  },
  // A package is judged by the innermost node_modules it sits in: npm nests
  // otplib's copy of @noble/hashes inside the plugin that uses it.
  transformIgnorePatterns: [`/node_modules/(?!(${ESM_ONLY})/)(?!.*/node_modules/)`],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
