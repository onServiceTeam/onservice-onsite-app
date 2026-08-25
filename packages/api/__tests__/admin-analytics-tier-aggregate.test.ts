/**
 * Phase 13 Dispatch E — admin-analytics commission tier aggregate (N+1 elim).
 *
 * Asserts that `getCommissionOptimizationSuggestions()` issues exactly ONE
 * db.query call (was: one query per tier; 4 queries for the default 4 tiers).
 *
 * Hermetic — db.query is a mock.
 */

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// MED-N06 (v1.1) — admin-analytics now reads commission rate via
// settingsService.getCommissionRate. Mock it so the existing
// "single query" test doesn't hit Redis/DB.
jest.mock('../src/services/settings.service', () => ({
  getCommissionRate: async (tier: string) => {
    // Return the same rates platformConfig has so existing
    // assertions about suggestedRate math remain valid.
    const rates: Record<string, number> = {
      founding: 0.10, new: 0.15, verified: 0.13, pro: 0.11, elite: 0.09,
    };
    return rates[tier] ?? 0.15;
  },
}));

import * as analyticsService from '../src/services/admin-analytics.service';
import { platformConfig } from '../src/config/platform.config';

beforeEach(() => {
  dbQueryMock.mockReset();
});

describe('getCommissionOptimizationSuggestions — single GROUP BY query (Phase 13 Dispatch E)', () => {
  test('issues exactly 1 db.query for the entire tier breakdown', async () => {
    const tiers = Object.keys(platformConfig.commissionRates);
    expect(tiers.length).toBeGreaterThan(0);

    // Single GROUP BY query returns one row per tier with computed fields.
    dbQueryMock.mockResolvedValueOnce({
      rows: tiers.map((tier) => ({
        tier,
        provider_count: '12',
        quality_sample_count: '12',
        avg_quality: '78.5',
        avg_revenue: '350000',
        avg_bookings: '15',
      })),
      rowCount: tiers.length,
    });

    const suggestions = await analyticsService.getCommissionOptimizationSuggestions();

    expect(dbQueryMock.mock.calls.length).toBe(1);
    expect(suggestions).toHaveLength(tiers.length);
    for (const s of suggestions) {
      expect(s.providerCount).toBe(12);
      expect(s.avgRevenue).toBe(350_000);
      expect(s.avgQualityScore).toBe(78.5);
    }
  });

  test('tiers absent from query result fall back to sentinel defaults', async () => {
    // DB returns only one tier; the others must still appear with defaults.
    const tiers = Object.keys(platformConfig.commissionRates);
    const firstTier = tiers[0]!;
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        tier: firstTier,
        provider_count: '8',
        quality_sample_count: '8',
        avg_quality: '70',
        avg_revenue: '100000',
        avg_bookings: '5',
      }],
      rowCount: 1,
    });

    const suggestions = await analyticsService.getCommissionOptimizationSuggestions();

    expect(dbQueryMock.mock.calls.length).toBe(1);
    expect(suggestions).toHaveLength(tiers.length);

    const first = suggestions.find((s) => s.tier === firstTier)!;
    expect(first.providerCount).toBe(8);

    for (const s of suggestions) {
      if (s.tier === firstTier) continue;
      expect(s.providerCount).toBe(0);
      expect(s.qualitySampleCount).toBe(0);
      expect(s.suggestedRate).toBe(s.currentRate);
      expect(typeof s.rationale).toBe('string');
    }
  });

  test('returns empty array (no db.query) when no tiers configured', async () => {
    const originalRates = { ...platformConfig.commissionRates };
    // Mutate only for this test; restore in finally.
    try {
      for (const k of Object.keys(originalRates)) {
        delete (platformConfig.commissionRates as Record<string, number>)[k];
      }
      const suggestions = await analyticsService.getCommissionOptimizationSuggestions();
      expect(suggestions).toEqual([]);
      expect(dbQueryMock.mock.calls.length).toBe(0);
    } finally {
      for (const [k, v] of Object.entries(originalRates)) {
        (platformConfig.commissionRates as Record<string, number>)[k] = v;
      }
    }
  });
});
