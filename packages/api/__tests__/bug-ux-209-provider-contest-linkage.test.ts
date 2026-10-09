const queryMock = jest.fn();
const transactionMock = jest.fn();
const emitAdminMock = jest.fn();
const deliverStoredNotificationPushMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: unknown) => transactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/escrow.service', () => ({ refundFromEscrow: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({
  emitAdminEvent: (...args: unknown[]) => emitAdminMock(...args),
  ADMIN_EVENTS: { DISPUTE_UPDATED: 'dispute:updated' },
}));
jest.mock('../src/services/settings.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({ enqueueRetry: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({
  deliverStoredNotificationPush: (...args: unknown[]) => deliverStoredNotificationPushMock(...args),
}));

import { addProviderResponse } from '../src/services/dispute.service';

it('Bug UX-209 — a provider contest notifies the customer and refreshes the admin dispute queue', async () => {
  const updated = {
    id: 'dispute-1', booking_id: 'booking-1', filed_by: 'customer-1', status: 'under_review',
    provider_response: 'I completed the agreed scope and have timestamps for review.',
  };
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 'dispute-1', booking_id: 'booking-1', status: 'open', provider_response: null }] })
    .mockResolvedValueOnce({ rows: [{ id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1', total_amount: '100000' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: 'provider-user-1' }] });

  const transactionQueries: Array<[string, unknown[]]> = [];
  transactionMock.mockImplementationOnce(async (callback: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<unknown>) => {
      const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        transactionQueries.push([sql, params]);
        if (sql.includes('SELECT * FROM disputes')) return { rows: [updated] };
        if (sql.includes('INSERT INTO notifications')) return { rows: [{ id: 'notification-1' }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
    };
    return callback(client);
  });

  const result = await addProviderResponse(
    'dispute-1',
    'provider-user-1',
    'I completed the agreed scope and have timestamps for review.',
    'contest',
  );

  expect(result).toBe(updated);
  const notification = transactionQueries.find(([sql]) => sql.includes('INSERT INTO notifications'));
  expect(notification?.[1]).toEqual([
    'customer-1',
    'Provider Responded to Dispute',
    'The provider contested your dispute. The case is now in the onService support review queue.',
    JSON.stringify({
      type: 'dispute_update',
      notificationType: 'dispute_update',
      disputeId: 'dispute-1',
      bookingId: 'booking-1',
      disputeStatus: 'under_review',
    }),
  ]);
  expect(deliverStoredNotificationPushMock).toHaveBeenCalledWith(expect.objectContaining({
    notificationId: 'notification-1',
    userId: 'customer-1',
    type: 'dispute_update',
  }));
  expect(emitAdminMock).toHaveBeenCalledWith('dispute:updated', {
    id: 'dispute-1', bookingId: 'booking-1', status: 'under_review',
  });
});
