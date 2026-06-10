import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points / thin wrappers that are exercised end-to-end, not in unit tests.
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/cli.ts',
        'src/types.ts',
      ],
      reporter: ['text', 'html'],
    },
  },
});
