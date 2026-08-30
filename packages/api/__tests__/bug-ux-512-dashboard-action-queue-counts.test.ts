const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getDashboardKpis } from '../src/services/admin-analytics.service';

it('Bug UX-512 — Dashboard KPI service returns canonical paid-assignment, support, and tester-feedback queue counts', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ current: '100', previous: '50' }] })
    .mockResolvedValueOnce({ rows: [{
      active_bookings: '12', paid_unassigned_bookings: '3', pending_disputes: '4',
      new_signups: '5', pending_approvals: '2', open_support_cases: '8',
      unassigned_support_cases: '6', urgent_support_cases: '1', new_feedback: '7',
      today_bookings: '9', escalated_disputes: '2', stale_disputes: '1',
    }] })
    .mockResolvedValueOnce({ rows: [{ escrow: '1000', revenue: '200', guarantee: '300' }] })
    .mockResolvedValueOnce({ rows: [{ burn: '100' }] });

  const result = await getDashboardKpis('today');
  const countsSql = String(dbQueryMock.mock.calls[1]?.[0]);

  expect(result).toEqual(expect.objectContaining({
    paidUnassignedBookings: 3,
    openSupportCases: 8,
    unassignedSupportCases: 6,
    urgentSupportCases: 1,
    newFeedback: 7,
  }));
  expect(countsSql).toContain("status = 'paid' AND provider_id IS NULL");
  expect(countsSql).toContain('assigned_agent_id IS NULL');
  expect(countsSql).toContain("feedback_submissions WHERE status = 'new'");
});
