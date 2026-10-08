import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/__tests__/**/*.test.ts'],
    globalSetup: ['scripts/__tests__/global-setup.ts'],
    testTimeout: 30000,
    // beforeAll hooks run the real extractors (git + TypeScript AST) against the
    // fixture repo; the 10s default is not enough for that on a cold cache.
    hookTimeout: 60000,
  },
});
