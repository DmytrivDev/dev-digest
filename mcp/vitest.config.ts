import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Single-sourced contracts live in the server's vendored shared (mcp
      // borrows them; see tsconfig paths). zod is aliased too so both the
      // shared schemas and mcp's own code resolve to ONE zod instance in tests.
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
      zod: path.resolve(__dirname, 'node_modules/zod'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
