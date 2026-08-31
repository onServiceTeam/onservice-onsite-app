/**
 * Phase 13 Dispatch E — admin-analytics commission tier aggregate (N+1 elim).
 *
 * Asserts that `getCommissionEvidence()` issues exactly ONE
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

import * as analyticsService from '../src/services/admin-analytics.service';
import { platformConfig } from '../src/config/platform.config';

beforeEach(() => {
  dbQueryMock.mockReset();
});

describe('getCommissionEvidence — single GROUP BY query (Phase 13 Dispatch E)', () => {
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
        avg_bookings: '15',
        avg_booking_value: '350000',
        current_rate: String(platformConfig.commissionRates[tier]),
      })),
      rowCount: tiers.length,
    });

    const evidence = await analyticsService.getCommissionEvidence();

    expect(dbQueryMock.mock.calls.length).toBe(1);
    expect(evidence).toHaveLength(tiers.length);
    for (const s of evidence) {
      expect(s.providerCount).toBe(12);
      expect(s.averageCompletedBookingValue).toBe(350_000);
      expect(s.legacyQualitySampleCount).toBe(12);
      expect(s.currentRate).toBe(platformConfig.commissionRates[s.tier]);
    }
    expect(dbQueryMock.mock.calls[0]?.[0]).toContain('platform_settings');
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
        avg_bookings: '5',
        avg_booking_value: '100000',
        current_rate: '0.17',
      }],
      rowCount: 1,
    });

    const evidence = await analyticsService.getCommissionEvidence();

    expect(dbQueryMock.mock.calls.length).toBe(1);
    expect(evidence).toHaveLength(tiers.length);

    const first = evidence.find((s) => s.tier === firstTier)!;
    expect(first.providerCount).toBe(8);
    expect(first.currentRate).toBe(0.17);

    for (const s of evidence) {
      if (s.tier === firstTier) continue;
      expect(s.providerCount).toBe(0);
      expect(s.legacyQualitySampleCount).toBe(0);
      expect(s.sampleStatus).toBe('insufficient');
      expect(s.currentRate).toBe(platformConfig.commissionRates[s.tier]);
    }
  });

  test('returns empty array (no db.query) when no tiers configured', async () => {
    const originalRates = { ...platformConfig.commissionRates };
    // Mutate only for this test; restore in finally.
    try {
      for (const k of Object.keys(originalRates)) {
        delete (platformConfig.commissionRates as Record<string, number>)[k];
      }
      const evidence = await analyticsService.getCommissionEvidence();
      expect(evidence).toEqual([]);
      expect(dbQueryMock.mock.calls.length).toBe(0);
    } finally {
      for (const [k, v] of Object.entries(originalRates)) {
        (platformConfig.commissionRates as Record<string, number>)[k] = v;
      }
    }
  });
});
