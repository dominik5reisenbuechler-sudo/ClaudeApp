import { defineConfig } from 'vitest/config';

/**
 * The domain layer is pure TypeScript with no React Native imports (ADR-002),
 * so tests run in a plain node environment with no native transform.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
