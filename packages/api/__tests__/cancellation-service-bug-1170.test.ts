// Bug 1170 / 1198 fix verified.
// Phase 14 Dispatch 02.

const mockQuery = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const redisStore: Record<string, string> = {};
const mockRedis = {
  get: jest.fn((key: string) => Promise.resolve(redisStore[key] ?? null)),
  set: jest.fn((key: string, value: string) => {
    redisStore[key] = value;
    return Promise.resolve('OK');
  }),
  del: jest.fn((key: string) => {
    delete redisStore[key];
    return Promise.resolve(1);
  }),
};
jest.mock('../src/config/redis.config', () => ({
  redis: mockRedis,
}));

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  findTier,
  getActivePolicy,
  bustActivePolicyCache,
  calculateCancellation,
  calculateProviderNoShow,
  previewTierForHours,
  CancellationPolicyTier,
} from '../src/services/pricing/cancellation.service';

const TIERS_V1: CancellationPolicyTier[] = [
  { min_hours_before: 24,    max_hours_before: null, refund_percent: 100, fee_percent: 0,   label: '24+ hours before' },
  { min_hours_before: 4,     max_hours_before: 24,   refund_percent: 75,  fee_percent: 25,  label: '4-24 hours before' },
  { min_hours_before: 0,     max_hours_before: 4,    refund_percent: 50,  fee_percent: 50,  label: 'under 4 hours' },
  { min_hours_before: -999,  max_hours_before: 0,    refund_percent: 0,   fee_percent: 100, label: 'after scheduled time / no-show' },
];

function policyRow(version: number, overrides: Partial<{ tiers: CancellationPolicyTier[]; provider_no_show_credit_php: number }> = {}): {
  version: number;
  effective_from: Date;
  tiers: CancellationPolicyTier[];
  intro_text: string;
  legal_disclaimer: string;
  provider_no_show_credit_php: number;
} {
  return {
    version,
    effective_from: new Date('2026-04-30T00:00:00Z'),
    tiers: overrides.tiers ?? TIERS_V1,
    intro_text: 'Cancel anytime.',
    legal_disclaimer: 'Refund within 5-10 business days.',
    provider_no_show_credit_php: overrides.provider_no_show_credit_php ?? 200,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockRedis.get.mockClear();
  mockRedis.set.mockClear();
  mockRedis.del.mockClear();
  for (const k of Object.keys(redisStore)) delete redisStore[k];
});

describe('Bug 1170 fix verified — findTier (boundary lookup)', () => {
  // Per the migration's interval semantics:
  //   min_hours_before is INCLUSIVE (>=), max_hours_before is EXCLUSIVE (<).
  // So a tier {min:4, max:24} covers [4, 24); a tier {min:24, max:null}
  // covers [24, +∞). At a boundary like 24h exactly, the tier with min=24
  // wins because [4,24) doesn't include 24.
  it.each<[number, string]>([
    [48, '24+ hours before'],
    [25, '24+ hours before'],
    [24.0001, '24+ hours before'],
    [24, '24+ hours before'],            // 24h boundary: lands in 24+ tier
    [23.99, '4-24 hours before'],
    [4.01, '4-24 hours before'],
    [4, '4-24 hours before'],            // 4h boundary: lands in 4-24 tier
    [3.99, 'under 4 hours'],
    [0.5, 'under 4 hours'],
    [0, 'under 4 hours'],                 // 0h boundary: pre-scheduled tier
    [-0.01, 'after scheduled time / no-show'],
    [-1, 'after scheduled time / no-show'],
    [-100, 'after scheduled time / no-show'],
  ])('hoursBefore=%p → tier "%s"', (hoursBefore, expected) => {
    const tier = findTier(hoursBefore, TIERS_V1);
    expect(tier).not.toBeNull();
    expect(tier!.label).toBe(expected);
  });

  it('returns null when no tier covers the hoursBefore', () => {
    const incomplete: CancellationPolicyTier[] = [
      { min_hours_before: 24, max_hours_before: null, refund_percent: 100, fee_percent: 0, label: 'top' },
    ];
    expect(findTier(0, incomplete)).toBeNull();
  });
});

describe('Bug 1170 fix verified — calculateCancellation', () => {
  beforeEach(() => {
    // booking lookup, then policy lookup
    mockQuery.mockImplementationOnce(() => Promise.resolve({
      rows: [{ scheduled_at: new Date('2026-05-02T12:00:00Z'), total_amount: 100000 }],
    }));
    mockQuery.mockImplementationOnce(() => Promise.resolve({
      rows: [policyRow(1)],
    }));
  });

  it('48h before → 100% refund, 0 fee', async () => {
    const result = await calculateCancellation('booking-1', new Date('2026-04-30T12:00:00Z'));
    expect(result.tier_label).toBe('24+ hours before');
    expect(result.refund_amount_centavos).toBe(100000);
    expect(result.fee_amount_centavos).toBe(0);
    expect(result.policy_version).toBe(1);
  });
});

describe('Bug 1170 fix verified — calculateCancellation tier transitions', () => {
  it.each<[string, Date, string, number, number]>([
    ['under 4h',   new Date('2026-05-02T11:30:00Z'), 'under 4 hours',                50000,  50000],   // 0.5h before
    ['4-24h',      new Date('2026-05-02T07:00:00Z'), '4-24 hours before',            75000,  25000],   // 5h before
    ['24+h',       new Date('2026-04-30T11:00:00Z'), '24+ hours before',             100000, 0],       // 49h before
    ['post-sched', new Date('2026-05-02T13:00:00Z'), 'after scheduled time / no-show', 0,    100000],  // 1h after scheduled
  ])('case %s → tier %s, refund=%d, fee=%d', async (_caseName, cancelTime, label, refund, fee) => {
    mockQuery.mockReset();
    mockQuery.mockImplementationOnce(() => Promise.resolve({
      rows: [{ scheduled_at: new Date('2026-05-02T12:00:00Z'), total_amount: 100000 }],
    }));
    mockQuery.mockImplementationOnce(() => Promise.resolve({ rows: [policyRow(1)] }));
    const result = await calculateCancellation('booking-x', cancelTime);
    expect(result.tier_label).toBe(label);
    expect(result.refund_amount_centavos).toBe(refund);
    expect(result.fee_amount_centavos).toBe(fee);
  });
});

describe('Bug 1170 fix verified — provider no-show branch', () => {
  beforeEach(() => {
    mockQuery.mockImplementationOnce(() => Promise.resolve({
      rows: [{ scheduled_at: new Date('2026-05-02T12:00:00Z'), total_amount: 250000 }],
    }));
    mockQuery.mockImplementationOnce(() => Promise.resolve({
      rows: [policyRow(1, { provider_no_show_credit_php: 200 })],
    }));
  });

  it('returns 100% refund + the configured PHP credit converted to centavos', async () => {
    const out = await calculateProviderNoShow('booking-2');
    expect(out.refund_amount_centavos).toBe(250000);
    expect(out.apology_credit_centavos).toBe(200 * 100);
    expect(out.policy_version).toBe(1);
  });

  it('honors a different platform-configured credit amount', async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementationOnce(() => Promise.resolve({
      rows: [{ scheduled_at: new Date('2026-05-02T12:00:00Z'), total_amount: 250000 }],
    }));
    mockQuery.mockImplementationOnce(() => Promise.resolve({
      rows: [policyRow(2, { provider_no_show_credit_php: 500 })],
    }));
    const out = await calculateProviderNoShow('booking-3');
    expect(out.apology_credit_centavos).toBe(50000);
  });
});

describe('Bug 1170 fix verified — Redis cache lifecycle', () => {
  it('first call hits DB then caches; second call hits Redis only', async () => {
    mockQuery.mockImplementationOnce(() => Promise.resolve({ rows: [policyRow(7)] }));

    const policyA = await getActivePolicy();
    expect(policyA.version).toBe(7);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledTimes(1);

    const policyB = await getActivePolicy();
    expect(policyB.version).toBe(7);
    expect(mockQuery).toHaveBeenCalledTimes(1); // unchanged — served from cache
    expect(mockRedis.get).toHaveBeenCalled();
  });

  it('bustActivePolicyCache deletes the key so the next call re-reads DB', async () => {
    mockQuery.mockImplementationOnce(() => Promise.resolve({ rows: [policyRow(8)] }));
    await getActivePolicy();
    expect(mockQuery).toHaveBeenCalledTimes(1);

    await bustActivePolicyCache();
    expect(mockRedis.del).toHaveBeenCalled();

    mockQuery.mockImplementationOnce(() => Promise.resolve({ rows: [policyRow(9, { tiers: TIERS_V1 })] }));
    const refreshed = await getActivePolicy();
    expect(refreshed.version).toBe(9);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('Redis read failure falls through to DB without throwing', async () => {
    mockRedis.get.mockImplementationOnce(() => Promise.reject(new Error('redis down')));
    mockQuery.mockImplementationOnce(() => Promise.resolve({ rows: [policyRow(10)] }));
    const policy = await getActivePolicy();
    expect(policy.version).toBe(10);
  });
});

describe('Bug 1170 fix verified — previewTierForHours', () => {
  it('matches calculateCancellation math for the same hour value on a sample booking', () => {
    const out = previewTierForHours(20, 100000, TIERS_V1);
    expect(out.tier!.label).toBe('4-24 hours before');
    expect(out.refund_amount_centavos).toBe(75000);
    expect(out.fee_amount_centavos).toBe(25000);
  });

  it('returns null tier when the policy has a gap', () => {
    const broken: CancellationPolicyTier[] = [
      { min_hours_before: 24, max_hours_before: null, refund_percent: 100, fee_percent: 0, label: 'top' },
    ];
    const out = previewTierForHours(5, 100000, broken);
    expect(out.tier).toBeNull();
  });
});
