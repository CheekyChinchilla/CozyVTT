import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ holds the Playwright smoke tests, which run in a real browser
    // against a running instance (npm run test:e2e), not here.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Vitest hands a test an empty string for any stylesheet it imports,
    // `?raw` included. The bundled font stylesheet is read as text by
    // src/__tests__/fonts.test.ts, which checks every file it names.
    css: { include: [/src\/assets\/fonts\/fonts\.css/] },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
});
