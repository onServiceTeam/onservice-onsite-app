const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getCommissionEvidence } from '../../src/services/admin-analytics.service';

describe('Commission signal sample safety', () => {
  beforeEach(() => dbQueryMock.mockReset());

  it('Bug UX-340 — a tier without real provider, quality, and completion samples keeps the live rate unchanged', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });

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
