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
    // Phase L MED-L04 fix — `dangerouslyIgnoreUnhandledErrors: true`
    // was silencing real null-check bugs at the suite level. The
    // five offenders found in audit (BookingHeader, DisputeHeader,
    // CustomerHeader, ProviderHeader, MarketingPage OverviewTab) all
    // got proper guards in this same wave. New async crashes will
    // now fail the suite and surface in CI as they should.
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
