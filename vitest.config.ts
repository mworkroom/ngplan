import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/domain/**/*.ts', 'src/engine/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/domain/types.ts',
        'src/engine/index.ts',
      ],
      thresholds: {
        branches: 95,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
  },
});
