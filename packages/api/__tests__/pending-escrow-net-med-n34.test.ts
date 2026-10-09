const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({}));

import * as providerToolsService from '../src/services/provider-tools.service';

it('Bug MED-N34 — provider pending escrow is summed from each booking snapshot', async () => {
  queryMock
    .mockResolvedValueOnce({
      rows: [{
        earned_today: '9000', earned_this_week: '18000', earned_this_month: '27000',
        pending_escrow: '0', total_jobs_today: '1', total_jobs_week: '2', total_jobs_month: '3',
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ pending_net: '90000', review_count: '2' }], rowCount: 1 });

  const result = await providerToolsService.getEarningsSummary('provider-1');

  expect(String(queryMock.mock.calls[1]?.[0])).toContain('booking_financial_terms_current');
  expect(result).toMatchObject({
    earnedToday: 9000,
    pendingEscrow: 90000,
    pendingEscrowReviewCount: 2,
    jobsThisMonth: 3,
  });
});
