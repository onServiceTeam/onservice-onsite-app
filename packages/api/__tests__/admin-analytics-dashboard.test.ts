/**
 * Phase 04 — unit tests for admin-analytics dashboard endpoints.
 *
 * The service is read-only analytics so we mock db.query and assert the
 * shape, math, and severity-mapping logic of each public function.
 */

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

import * as analytics from '../src/services/admin-analytics.service';

beforeEach(() => {
  dbQueryMock.mockReset();
});

function rows<T>(data: T[]): { rows: T[] } {
  return { rows: data };
}

describe('isDashboardRange', () => {
  it.each(['today', '7d', '30d', '90d', 'ytd'])('accepts %s', (v) => {
    expect(analytics.isDashboardRange(v)).toBe(true);
  });

  it.each(['', 'tomorrow', '1d', '365d', null, undefined, 7, {}])(
    'rejects invalid %p',
    (v) => {
      expect(analytics.isDashboardRange(v)).toBe(false);
    },
  );
});

describe('getDashboardKpis', () => {
  it('aggregates revenue, counts, wallets and computes runway', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ current: '50000', previous: '25000' }])) // rev
      .mockResolvedValueOnce(
        rows([
          {
            active_bookings: '4',
            paid_unassigned_bookings: '1',
            pending_disputes: '2',
            new_signups: '12',
            pending_approvals: '3',
            open_support_cases: '5',
            unassigned_support_cases: '2',
            urgent_support_cases: '1',
            new_feedback: '4',
            today_bookings: '7',
            escalated_disputes: '1',
            stale_disputes: '0',
          },
        ]),
      )
      .mockResolvedValueOnce(
        rows([{ escrow: '900000', revenue: '120000', guarantee: '500000' }]),
      )
      .mockResolvedValueOnce(rows([{ burn: '100000' }]));

    const result = await analytics.getDashboardKpis('30d');

    expect(result.revenue).toBe(50000);
    expect(result.revenueTrendPct).toBe(100); // (50000-25000)/25000*100
    expect(result.activeBookings).toBe(4);
    expect(result.paidUnassignedBookings).toBe(1);
    expect(result.pendingDisputes).toBe(2);
    expect(result.newSignups).toBe(12);
    expect(result.pendingApprovals).toBe(3);
    expect(result.todayBookings).toBe(7);
    expect(result.escalatedDisputes).toBe(1);
    expect(result.staleDisputes).toBe(0);
    expect(result.escrowBalance).toBe(900000);
    expect(result.platformRevenue).toBe(120000);
    expect(result.guaranteeFund).toBe(500000);
    // 500000 / 100000 = 5 months
    expect(result.guaranteeFundRunwayMonths).toBe(5);
  });

  it('caps runway at 99 when burn is zero', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ current: '0', previous: '0' }]))
      .mockResolvedValueOnce(
        rows([
          {
            active_bookings: '0',
            paid_unassigned_bookings: '0',
            pending_disputes: '0',
            new_signups: '0',
            pending_approvals: '0',
            open_support_cases: '0',
            unassigned_support_cases: '0',
            urgent_support_cases: '0',
            new_feedback: '0',
            today_bookings: '0',
            escalated_disputes: '0',
            stale_disputes: '0',
          },
        ]),
      )
      .mockResolvedValueOnce(rows([{ escrow: '0', revenue: '0', guarantee: '1000' }]))
      .mockResolvedValueOnce(rows([{ burn: '0' }]));

    const result = await analytics.getDashboardKpis('today');
    expect(result.guaranteeFundRunwayMonths).toBe(99);
    expect(result.revenueTrendPct).toBe(0);
  });

  it('reports +100% when previous revenue is zero and current is positive', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ current: '500', previous: '0' }]))
      .mockResolvedValueOnce(
        rows([
          {
            active_bookings: '0',
            paid_unassigned_bookings: '0',
            pending_disputes: '0',
            new_signups: '0',
            pending_approvals: '0',
            open_support_cases: '0',
            unassigned_support_cases: '0',
            urgent_support_cases: '0',
            new_feedback: '0',
            today_bookings: '0',
            escalated_disputes: '0',
            stale_disputes: '0',
          },
        ]),
      )
      .mockResolvedValueOnce(rows([{ escrow: '0', revenue: '0', guarantee: '0' }]))
      .mockResolvedValueOnce(rows([{ burn: '0' }]));

    const result = await analytics.getDashboardKpis('7d');
    expect(result.revenueTrendPct).toBe(100);
  });

  it.each<analytics.DashboardRange>(['today', '7d', '30d', '90d', 'ytd'])(
    'executes 4 parallel queries for range %s',
    async (range) => {
      dbQueryMock
        .mockResolvedValueOnce(rows([{ current: '0', previous: '0' }]))
        .mockResolvedValueOnce(
          rows([
            {
              active_bookings: '0',
              paid_unassigned_bookings: '0',
              pending_disputes: '0',
              new_signups: '0',
              pending_approvals: '0',
              open_support_cases: '0',
              unassigned_support_cases: '0',
              urgent_support_cases: '0',
              new_feedback: '0',
              today_bookings: '0',
              escalated_disputes: '0',
              stale_disputes: '0',
            },
          ]),
        )
        .mockResolvedValueOnce(rows([{ escrow: '0', revenue: '0', guarantee: '0' }]))
        .mockResolvedValueOnce(rows([{ burn: '0' }]));

      await analytics.getDashboardKpis(range);
      expect(dbQueryMock).toHaveBeenCalledTimes(4);
    },
  );
});

describe('getRevenueTrend', () => {
  it('clamps days to [1,366] and returns mapped points', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([
        { date: '2026-01-01', gmv: '10000', revenue: '1000' },
        { date: '2026-01-02', gmv: '20000', revenue: '2000' },
      ]),
    );

    const result = await analytics.getRevenueTrend(30);

    expect(result).toEqual([
      { date: '2026-01-01', gmv: 10000, revenue: 1000 },
      { date: '2026-01-02', gmv: 20000, revenue: 2000 },
    ]);
    expect(dbQueryMock).toHaveBeenCalledWith(expect.any(String), [30]);
  });

  it('clamps days <1 to 1', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await analytics.getRevenueTrend(0);
    expect(dbQueryMock).toHaveBeenCalledWith(expect.any(String), [1]);
  });

  it('clamps days above a leap year to 366', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await analytics.getRevenueTrend(9999);
    expect(dbQueryMock).toHaveBeenCalledWith(expect.any(String), [366]);
  });

  it('clamps NaN to 1', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await analytics.getRevenueTrend(Number.NaN);
    expect(dbQueryMock).toHaveBeenCalledWith(expect.any(String), [1]);
  });
});

describe('getBookingVolumeByCategory', () => {
  it('returns category/count tuples', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([
        { category: 'Plumbing', count: '12' },
        { category: 'Electrical', count: '5' },
      ]),
    );

    const result = await analytics.getBookingVolumeByCategory(7);

    expect(result).toEqual([
      { category: 'Plumbing', count: 12 },
      { category: 'Electrical', count: 5 },
    ]);
    expect(dbQueryMock).toHaveBeenCalledWith(expect.any(String), [7]);
  });
});

describe('getCustomerAcquisitionFunnel', () => {
  it('parses funnel counts as numbers', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([{ registered: '100', first_booking: '40', repeat_booking: '15' }]),
    );

    const result = await analytics.getCustomerAcquisitionFunnel(30);

    expect(result).toEqual({
      registered: 100,
      firstBooking: 40,
      repeatBooking: 15,
    });
  });
});

describe('getOperationalAlerts', () => {
  it('returns empty array when nothing is wrong', async () => {
    // 7 parallel queries — all return empty rows
    for (let i = 0; i < 7; i++) {
      dbQueryMock.mockResolvedValueOnce(rows([]));
    }
    // Last query (guarantee fund) needs a real shape
    dbQueryMock.mockReset();
    for (let i = 0; i < 6; i++) {
      dbQueryMock.mockResolvedValueOnce(rows([]));
    }
    dbQueryMock.mockResolvedValueOnce(rows([{ balance: '1000', burn: '0' }]));

    const result = await analytics.getOperationalAlerts();
    expect(result).toEqual([]);
  });

  it('emits danger alert for 3 consecutive 1-star reviews', async () => {
    const latest = new Date('2026-02-01T10:00:00Z');
    dbQueryMock
      .mockResolvedValueOnce(
        rows([{ provider_id: 'p1', full_name: 'Juan Cruz', consec: '3', latest_at: latest }]),
      )
      .mockResolvedValueOnce(rows([])) // disputes stale
      .mockResolvedValueOnce(rows([])) // webhooks
      .mockResolvedValueOnce(rows([])) // nbi
      .mockResolvedValueOnce(rows([])) // chronic customer
      .mockResolvedValueOnce(rows([])) // underserved cities
      .mockResolvedValueOnce(rows([{ balance: '1000', burn: '0' }]));

    const result = await analytics.getOperationalAlerts();
    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('danger');
    expect(result[0]?.action_url).toBe('/providers/p1');
    expect(result[0]?.type).toBe('provider_consecutive_one_star');
  });

  it('emits danger alert when guarantee fund < 30% of monthly burn', async () => {
    for (let i = 0; i < 6; i++) {
      dbQueryMock.mockResolvedValueOnce(rows([]));
    }
    // balance 100, burn 1000 → 100 < 300 → alert
    dbQueryMock.mockResolvedValueOnce(rows([{ balance: '100', burn: '1000' }]));

    const result = await analytics.getOperationalAlerts();
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('guarantee_fund_low');
    expect(result[0]?.severity).toBe('danger');
    expect(result[0]?.action_url).toBe('/financials?tab=guarantee');
  });

  it('does NOT emit guarantee fund alert when balance >= 30% burn', async () => {
    for (let i = 0; i < 6; i++) {
      dbQueryMock.mockResolvedValueOnce(rows([]));
    }
    // balance 400, burn 1000 → 400 >= 300 → no alert
    dbQueryMock.mockResolvedValueOnce(rows([{ balance: '400', burn: '1000' }]));

    const result = await analytics.getOperationalAlerts();
    expect(result).toEqual([]);
  });

  it('maps stale dispute to warning severity with /disputes URL', async () => {
    const created = new Date('2026-01-01T00:00:00Z');
    dbQueryMock
      .mockResolvedValueOnce(rows([])) // 1 star
      .mockResolvedValueOnce(rows([{ id: 'd-7', created_at: created }])) // stale dispute
      .mockResolvedValueOnce(rows([])) // webhooks
      .mockResolvedValueOnce(rows([])) // nbi
      .mockResolvedValueOnce(rows([])) // chronic
      .mockResolvedValueOnce(rows([])) // cities
      .mockResolvedValueOnce(rows([{ balance: '1000', burn: '0' }]));

    const result = await analytics.getOperationalAlerts();
    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('warning');
    expect(result[0]?.action_url).toBe('/disputes/d-7');
  });

  it('maps underserved city to info severity', async () => {
    for (let i = 0; i < 5; i++) {
      dbQueryMock.mockResolvedValueOnce(rows([]));
    }
    dbQueryMock
      .mockResolvedValueOnce(rows([{ id: 'sa-1', name: 'Cebu', active_provider_count: 2 }]))
      .mockResolvedValueOnce(rows([{ balance: '1000', burn: '0' }]));

    const result = await analytics.getOperationalAlerts();
    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('info');
    expect(result[0]?.type).toBe('city_low_provider_count');
    expect(result[0]?.action_url).toBe('/service-areas?search=Cebu');
  });

  it('sorts alerts by created_at descending', async () => {
    const older = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-02-01T00:00:00Z');
    dbQueryMock
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(
        rows([
          { id: 'd-old', created_at: older },
          { id: 'd-new', created_at: newer },
        ]),
      )
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([]))
      .mockResolvedValueOnce(rows([{ balance: '1000', burn: '0' }]));

    const result = await analytics.getOperationalAlerts();
    expect(result.map((a) => a.id)).toEqual(['dispute-stale:d-new', 'dispute-stale:d-old']);
  });
});

describe('getCitiesPerformance', () => {
  it('parses numeric counts and returns city tiles', async () => {
    dbQueryMock.mockResolvedValueOnce(
      rows([
        {
          id: 'sa-1',
          name: 'Manila',
          status: 'active',
          active_provider_count: 25,
          today_bookings: '17',
        },
        {
          id: 'sa-2',
          name: 'Cebu',
          status: 'soft_launch',
          active_provider_count: 8,
          today_bookings: '3',
        },
      ]),
    );

    const result = await analytics.getCitiesPerformance();
    expect(result).toEqual([
      { id: 'sa-1', name: 'Manila', status: 'active', activeProviders: 25, todayBookings: 17 },
      { id: 'sa-2', name: 'Cebu', status: 'soft_launch', activeProviders: 8, todayBookings: 3 },
    ]);
  });
});
