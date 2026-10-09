import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Argon2 hashing makes the integration tests slow on a cold start (and on CI runners).
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
