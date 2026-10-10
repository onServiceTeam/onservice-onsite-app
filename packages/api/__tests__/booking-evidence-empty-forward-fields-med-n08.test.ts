const mockDbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/services/or.service', () => ({}));
jest.mock('../src/services/payment.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));

import { getBookingEvidence } from '../src/services/booking-admin.service';

it('MED-N08 - booking evidence keeps forward-compatible empty fields without querying nonexistent tables', async () => {
  mockDbQuery
    .mockResolvedValueOnce({
      rows: [{
        id: 'booking-med-n08',
        customer_id: 'customer-med-n08',
        provider_user_id: 'provider-user-med-n08',
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{ cnt: '3' }], rowCount: 1 });

  const evidence = await getBookingEvidence('booking-med-n08');

  expect(evidence).toEqual({
    photos: [],
    chatMessageCount: 3,
    gpsCheckIns: [],
    receipts: [],
  });
  expect(mockDbQuery).toHaveBeenCalledTimes(3);
  const executedSql = mockDbQuery.mock.calls.map(([sql]) => sql as string).join('\n');
  expect(executedSql).not.toMatch(/to_regclass|FROM gps_checkins|FROM receipts/i);
});
