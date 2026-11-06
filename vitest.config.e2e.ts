import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // E2E suites share one database, so run them one at a time.
    fileParallelism: false,
  },
});
