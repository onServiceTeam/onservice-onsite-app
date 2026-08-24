const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getNumericSetting: jest.fn(),
}));

import { getMyReferrals } from '../src/services/referral.service';

it('Bug UX-274 — referral totals come from the complete ledger instead of only the current history page', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ id: 'code-1', user_id: 'user-1', type: 'standard', is_active: true }] })
    .mockResolvedValueOnce({
      rows: [{ total_referrals: '25', credited_referrals: '22', pending_referrals: '3', total_earned: '275000' }],
    })
    .mockResolvedValueOnce({
      rows: [{ id: 'latest-row', referrer_id: 'user-1', referrer_bonus: 10000, referrer_credited: true }],
    });

  const result = await getMyReferrals('user-1', 1, 1);

  expect(result.redemptions).toHaveLength(1);
  expect(result.total).toBe(25);
  expect(result.summary).toEqual({
    totalReferrals: 25,
    creditedReferrals: 22,
    pendingReferrals: 3,
    totalEarned: 275000,
  });
  expect(dbQueryMock.mock.calls[1][0]).toMatch(/SUM\(referrer_bonus\).*referrer_credited = TRUE/s);
});
