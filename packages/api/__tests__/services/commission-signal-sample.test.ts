const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getCommissionEvidence } from '../../src/services/admin-analytics.service';
import { platformConfig } from '../../src/config/platform.config';

describe('Commission signal sample safety', () => {
  beforeEach(() => dbQueryMock.mockReset());

  it('Bug UX-340 — a tier without real provider, quality, and completion samples keeps the live rate unchanged', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: Object.entries(platformConfig.commissionRates).map(([tier, rate]) => ({
        tier,
        provider_count: '0',
        quality_sample_count: '0',
        avg_bookings: '0',
        avg_booking_value: '0',
        current_rate: String(rate),
      })),
    });

    const signals = await getCommissionEvidence();

    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(signal.providerCount).toBe(0);
      expect(signal.legacyQualitySampleCount).toBe(0);
      expect(signal.averageCompletedBookings).toBe(0);
      expect(signal.sampleStatus).toBe('insufficient');
      expect(signal).not.toHaveProperty('suggestedRate');
    }
  });
});
