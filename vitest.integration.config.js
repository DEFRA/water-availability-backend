import { defineConfig } from 'vitest/config'

// Separate from vitest.config.js, which excludes *.integration.test.js from default
// discovery - run via `npm run test:integration` once Postgres is running/migrated/seeded.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    fileParallelism: false,
    include: ['src/**/*.integration.test.js'],
    setupFiles: ['.vite/setup-files.js']
  }
})
