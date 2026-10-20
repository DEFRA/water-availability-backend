import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    fileParallelism: false,
    // Applies to every entry point (npm test, npm run test:watch, IDE test runners, bare
    // `npx vitest`) - integration tests need a running/migrated Postgres and are run
    // separately via `npm run test:integration` (see vitest.integration.config.js).
    exclude: [...configDefaults.exclude, '**/*.integration.test.js'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [...configDefaults.exclude, 'coverage']
    },
    setupFiles: ['.vite/setup-files.js']
  }
})
