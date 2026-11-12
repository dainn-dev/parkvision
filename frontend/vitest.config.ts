import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Same `@` alias as vite.config.ts, so component tests can import the UI kit.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
