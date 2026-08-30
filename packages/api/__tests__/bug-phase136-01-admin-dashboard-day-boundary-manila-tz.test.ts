const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getCitiesPerformance, getDashboardKpis } from '../src/services/admin-analytics.service';

it('BUG-PHASE136-01 — executed Dashboard KPI and city queries use Manila day/year boundaries', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ current: '0', previous: '0' }] })
    .mockResolvedValueOnce({ rows: [{
      active_bookings: '0', paid_unassigned_bookings: '0', pending_disputes: '0',
      new_signups: '0', pending_approvals: '0', open_support_cases: '0',
      unassigned_support_cases: '0', urgent_support_cases: '0', new_feedback: '0',
      today_bookings: '0', escalated_disputes: '0', stale_disputes: '0',
    }] })
    .mockResolvedValueOnce({ rows: [{ escrow: '0', revenue: '0', guarantee: '0' }] })
    .mockResolvedValueOnce({ rows: [{ burn: '0' }] })
    .mockResolvedValueOnce({ rows: [] });

  await getDashboardKpis('today');
  await getCitiesPerformance();

  const revenueSql = String(dbQueryMock.mock.calls[0]?.[0]);
  const countsSql = String(dbQueryMock.mock.calls[1]?.[0]);
  const citiesSql = String(dbQueryMock.mock.calls[4]?.[0]);
  const manilaDay = "DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'";
  expect(revenueSql).toContain(manilaDay);
  expect(countsSql).toContain(manilaDay);
  expect(citiesSql).toContain(manilaDay);
  expect(revenueSql).not.toContain("DATE_TRUNC('day', NOW())");
});
