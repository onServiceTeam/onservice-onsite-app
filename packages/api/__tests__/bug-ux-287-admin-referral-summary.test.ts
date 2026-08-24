const mockDbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockDbQuery(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/upload.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));

import { getCustomerReferrals } from '../src/services/customer-admin.service';

it('Bug UX-287 — Customer 360 referral KPIs use the complete ledger while retaining a bounded support history', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'latest', referee_id: 'friend-1', referee_name: 'Friend One', referee_bonus: 10000,
        referrer_bonus: 10000, referrer_credited: true, qualifying_booking_id: 'booking-1',
        created_at: new Date('2026-08-25T00:00:00.000Z'),
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({
      rows: [{ total_referrals: '250', credited_referrals: '220', pending_referrals: '30', total_earned: '2750000' }],
      rowCount: 1,
    });

  const result = await getCustomerReferrals('customer-1');

  expect(result.given).toHaveLength(1);
  expect(result).toMatchObject({
    totalReferrals: 250,
    creditedReferrals: 220,
    pendingReferrals: 30,
    totalEarnedFromReferrals: 2750000,
  });
  expect(mockDbQuery.mock.calls[1][0]).toMatch(/LIMIT 200/);
});
