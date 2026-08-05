import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // static-api.test.js spawns a child `node` process mid-suite; running
    // test files in parallel let that starve api.test.js's concurrent
    // supertest requests on CI's constrained runners, aborting them.
    fileParallelism: false,
  },
});
