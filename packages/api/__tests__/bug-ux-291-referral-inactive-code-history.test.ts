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

it('Bug UX-291 — referral history and earnings remain visible after a referral code becomes inactive', async () => {
  dbQueryMock
    .mockResolvedValueOnce({
      rows: [{ id: 'code-old', user_id: 'user-1', type: 'standard', is_active: false }],
    })
    .mockResolvedValueOnce({
      rows: [{ total_referrals: '2', credited_referrals: '1', pending_referrals: '1', total_earned: '12500' }],
    })
    .mockResolvedValueOnce({
      rows: [{ id: 'redemption-1', referrer_id: 'user-1', referrer_credited: true }],
    });

  const result = await getMyReferrals('user-1');

  expect(dbQueryMock.mock.calls[0][0]).not.toMatch(/is_active\s*=\s*TRUE/i);
  expect(result.code?.is_active).toBe(false);
  expect(result.total).toBe(2);
  expect(result.summary.totalEarned).toBe(12500);
  expect(result.redemptions).toHaveLength(1);
});
