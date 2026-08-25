const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../../src/services/settings.service', () => ({
  getCommissionRate: jest.fn(async () => 0.15),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getCommissionOptimizationSuggestions } from '../../src/services/admin-analytics.service';

describe('Commission signal sample safety', () => {
  beforeEach(() => dbQueryMock.mockReset());

  it('Bug UX-340 — a tier without real provider, quality, and completion samples keeps the live rate unchanged', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });

    const signals = await getCommissionOptimizationSuggestions();

    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(signal.providerCount).toBe(0);
      expect(signal.qualitySampleCount).toBe(0);
      expect(signal.averageCompletedBookings).toBe(0);
      expect(signal.suggestedRate).toBe(signal.currentRate);
      expect(signal.rationale).toMatch(/Insufficient sample for a rate signal/);
    }
  });
});
