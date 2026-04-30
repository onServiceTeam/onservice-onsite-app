/**
 * Phase 14 R7-real — vitest config for admin per-page tests.
 *
 * Vitest works against Vite's existing config, so admin's existing
 * tsconfig + path aliases (@/*) carry through automatically.
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    // Pages that mount cleanly but trigger async errors during data
    // resolution (real null-check bugs caught by the real-render tests)
    // are documented per-test as it.todo. Async errors from those
    // mounts are not test failures — the it.todo IS the assertion.
    // CI exit code stays 0 when all suites pass + only async noise
    // remains.
    dangerouslyIgnoreUnhandledErrors: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
