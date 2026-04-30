// Phase 14 Dispatch 05 — surge.service.ts tests.
//
// Verifies the typed-shape adapter around legacy `calculatePricing`. The
// legacy rule-matching logic (rush / holiday / peak_hours, priority,
// service-area-by-city) is already in the codebase and exercised via
// booking.service.ts in production; here we verify the wrapper returns
// the expected SurgeRule shape (or null) for the underlying outcomes.

jest.mock('../../../src/models/db', () => ({
  db: { query: jest.fn() },
}));

jest.mock('../../../src/services/pricing.service', () => ({
  calculatePricing: jest.fn(),
}));

import { db } from '../../../src/models/db';
import { calculatePricing } from '../../../src/services/pricing.service';
import { resolveSurgeRule } from '../../../src/services/booking/surge.service';

const mockedQuery = db.query as jest.MockedFunction<typeof db.query>;
const mockedCalculate = calculatePricing as jest.MockedFunction<typeof calculatePricing>;

const baseInput = {
  serviceCategoryId: 'cat-1',
  scheduledAt: new Date('2026-05-01T19:00:00Z').toISOString(),
  city: 'Boracay',
};

const SAMPLE_APPLIED = {
  basePrice: 0,
  surgeMultiplier: 1.5,
  surgeAmount: 0,
  finalPrice: 0,
  appliedRule: { id: 'rule-1', name: 'Friday Peak', type: 'peak_hours', multiplier: 1.5 },
  platformSurgeShare: 0,
  providerSurgeShare: 0,
};

beforeEach(() => {
  mockedQuery.mockReset();
  mockedCalculate.mockReset();
});

describe('surge.service resolveSurgeRule', () => {
  it('returns null when no rule matches', async () => {
    mockedCalculate.mockResolvedValue({ ...SAMPLE_APPLIED, appliedRule: null });
    const result = await resolveSurgeRule(baseInput);
    expect(result).toBeNull();
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns SurgeRule with multiplier + name + share rate when a rule matches', async () => {
    mockedCalculate.mockResolvedValue(SAMPLE_APPLIED);
    mockedQuery.mockImplementation((async () => ({
      rows: [{ platform_surge_share: '0.5' }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    })) as never);
    const result = await resolveSurgeRule(baseInput);
    expect(result).toEqual({
      id: 'rule-1',
      multiplier: 1.5,
      platformSurgeShare: 0.5,
      ruleName: 'Friday Peak',
    });
  });

  it('defaults platformSurgeShare to 0 when row missing (defensive)', async () => {
    mockedCalculate.mockResolvedValue(SAMPLE_APPLIED);
    mockedQuery.mockImplementation((async () => ({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    })) as never);
    const result = await resolveSurgeRule(baseInput);
    expect(result?.platformSurgeShare).toBe(0);
  });

  it('passes city through to legacy calculator', async () => {
    mockedCalculate.mockResolvedValue({ ...SAMPLE_APPLIED, appliedRule: null });
    await resolveSurgeRule({ ...baseInput, city: 'Manila' });
    const callArgs = mockedCalculate.mock.calls[0]!;
    expect(callArgs[0]).toBe(0); // basePrice always 0 (we only want rule matching)
    expect(callArgs[2]).toBe('cat-1');
    expect(callArgs[3]).toBe('Manila');
  });

  it('coerces non-numeric platformSurgeShare to 0 (defensive against bad data)', async () => {
    mockedCalculate.mockResolvedValue(SAMPLE_APPLIED);
    mockedQuery.mockImplementation((async () => ({
      rows: [{ platform_surge_share: 'not-a-number' }],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    })) as never);
    const result = await resolveSurgeRule(baseInput);
    expect(result?.platformSurgeShare).toBe(0);
  });
});
