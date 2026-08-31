// MED-N11 fix verified — getRevenueByPaymentMethod now surfaces
// the missing-column / failed-query case via a structured
// `{rows, degraded, message}` result instead of silently
// returning a placeholder "Unknown" row.
//
// Pre-fix: catch block returned [{dimension: 'unknown', label:
// 'Unknown', revenueCentavos: 0, bookings: 0}] — operators saw
// "all bookings paid via Unknown method" and couldn't tell
// whether the data was real or a missing-column fallback.
//
// Post-fix: success path returns {rows: [...], degraded: false,
// message: null}. Failure path returns {rows: [], degraded: true,
// message: 'Payment-method revenue is unavailable...'} so the
// admin UI can show a banner.

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

import * as svc from '../src/services/financial-admin.service';

describe('MED-N11 — getRevenueByPaymentMethod success path', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
  });

  it('returns {rows, degraded:false, message:null} on a successful query', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { method: 'gcash', revenue: '500000', bookings: '5' },
        { method: 'maya', revenue: '300000', bookings: '3' },
      ],
    });
    const out = await svc.getRevenueByPaymentMethod('2026-04-01', '2026-04-30');
    expect(out.degraded).toBe(false);
    expect(out.message).toBeNull();
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toEqual({
      dimension: 'gcash',
      label: 'GCASH',
      revenueCentavos: 500_000,
      bookings: 5,
    });
  });

  it('null payment_method maps to an explicitly unattributed revenue label', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { method: null, revenue: '100000', bookings: '1' },
      ],
    });
    const out = await svc.getRevenueByPaymentMethod('2026-04-01', '2026-04-30');
    expect(out.rows[0]!.dimension).toBe('unknown');
    expect(out.rows[0]!.label).toBe('Unattributed');
  });
});

describe('MED-N11 — getRevenueByPaymentMethod degraded path', () => {
  beforeEach(() => {
    dbQueryMock.mockReset();
  });

  it('returns {rows: [], degraded: true, message: ...} when the query throws (missing column simulated)', async () => {
    dbQueryMock.mockRejectedValueOnce(new Error('column "payment_method" does not exist'));
    const out = await svc.getRevenueByPaymentMethod('2026-04-01', '2026-04-30');
    expect(out.degraded).toBe(true);
    expect(out.rows).toEqual([]);
    expect(out.message).toMatch(/Payment-method revenue is unavailable/);
    expect(out.message).toMatch(/apply outstanding migrations/);
  });

  it('does NOT return a silent "all unknown" placeholder row any more', async () => {
    dbQueryMock.mockRejectedValueOnce(new Error('any failure'));
    const out = await svc.getRevenueByPaymentMethod('2026-04-01', '2026-04-30');
    // Pre-fix returned: [{dimension: 'unknown', label: 'Unknown', revenueCentavos: 0, bookings: 0}]
    expect(out.rows).not.toContainEqual(
      expect.objectContaining({ dimension: 'unknown', revenueCentavos: 0, bookings: 0 }),
    );
  });

  it('does not throw to the caller (graceful degradation preserved)', async () => {
    dbQueryMock.mockRejectedValueOnce(new Error('schema not migrated'));
    await expect(
      svc.getRevenueByPaymentMethod('2026-04-01', '2026-04-30'),
    ).resolves.toBeDefined();
  });
});
