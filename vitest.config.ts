import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/__tests__/**/*.test.ts'],
          exclude: ['src/ui/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/__tests__/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/domain/**/*.ts',
        'src/engine/**/*.ts',
        'src/optimizer/**/*.ts',
        'src/application/**/*.ts',
        'src/cloud/**/*.ts',
        'src/ui/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/__tests__/**',
        'src/domain/types.ts',
        'src/engine/index.ts',
        'src/optimizer/types.ts',
        'src/optimizer/index.ts',
      ],
      thresholds: {
        'src/domain/**': {
          branches: 95,
          functions: 95,
          lines: 95,
          statements: 95,
        },
        'src/engine/**': {
          branches: 95,
          functions: 95,
          lines: 95,
          statements: 95,
        },
        'src/optimizer/**': {
          branches: 95,
          functions: 95,
          lines: 95,
          statements: 95,
        },
        'src/application/**': {
          branches: 95,
          functions: 95,
          lines: 95,
          statements: 95,
        },
        'src/cloud/**': {
          branches: 85,
          functions: 90,
          lines: 95,
          statements: 90,
        },
        'src/ui/**': {
          branches: 85,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
  },
});
