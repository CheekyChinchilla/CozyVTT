module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  // Refuses to start against a database whose name has no "test" in it; the
  // suites write to it freely. See the file.
  globalSetup: '<rootDir>/src/__tests__/helpers/jest.globalSetup.ts',
  // Caps each Prisma pool, and disconnects every file's clients when it ends,
  // so a full run stays under PostgreSQL's connection ceiling; see the files.
  setupFiles: ['<rootDir>/src/__tests__/helpers/jest.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/helpers/jest.afterEnv.ts'],
  // A worker keeps memory from one test file to the next, and over a full run
  // its heap reached Node's 4 GB default and the worker crashed. Restarting a
  // worker once it holds more than this keeps a full run well inside it.
  workerIdleMemoryLimit: '1GB',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // file-type is ESM-only (no CJS build) and cannot be resolved by ts-jest's
  // CommonJS transform. Map it to a loud-failing stub — no automated test
  // exercises real magic-byte sniffing; see the mock for details.
  moduleNameMapper: {
    '^file-type$': '<rootDir>/src/__tests__/helpers/file-type-mock.ts',
  },
  // otplib (authenticator codes) is CommonJS, and loads two packages that are
  // ES modules only: @noble/hashes for HMAC-SHA1 and @scure/base for base32.
  // Node loads those itself, and Jest does only when run with
  // --experimental-vm-modules, so these two are compiled to CommonJS for the
  // tests, and the tests check codes with the real library.
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '/node_modules/(@noble/hashes|@scure/base)/.+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true, module: 'commonjs', target: 'ES2022' }, diagnostics: false },
    ],
  },
  // A package is judged by the innermost node_modules it sits in: npm nests
  // otplib's copy of @noble/hashes inside the plugin that uses it.
  transformIgnorePatterns: ['/node_modules/(?!(@noble/hashes|@scure/base)/)(?!.*/node_modules/)'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
