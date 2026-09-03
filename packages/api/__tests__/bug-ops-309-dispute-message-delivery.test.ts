const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (callback: unknown) => transactionMock(callback),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../src/services/dispute.service', () => ({}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));

const deliverStoredNotificationPushMock = jest.fn();
jest.mock('../src/services/notification.service', () => ({
  deliverStoredNotificationPush: (...args: unknown[]) => deliverStoredNotificationPushMock(...args),
}));

import { sendDisputeMessage } from '../src/services/dispute-admin.service';

beforeEach(() => {
  transactionMock.mockReset();
  deliverStoredNotificationPushMock.mockReset();
  deliverStoredNotificationPushMock.mockResolvedValue(undefined);
});

it('Bug OPS-309 — a dispute update is durably delivered to both participant inboxes before its audit commits', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let notificationNumber = 0;
  transactionMock.mockImplementationOnce(async (callback: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<unknown>) => {
    const client = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/FROM disputes/.test(sql)) {
          return {
            rows: [{
              id: 'dispute-1',
              booking_id: 'booking-1',
              customer_id: 'customer-1',
              provider_user_id: 'provider-user-1',
            }],
            rowCount: 1,
          };
        }
        if (/INSERT INTO notifications/.test(sql)) {
          notificationNumber += 1;
          return { rows: [{ id: `notification-${notificationNumber}` }], rowCount: 1 };
        }
        if (/INSERT INTO admin_actions/.test(sql)) {
          return { rows: [{ id: 'audit-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    return callback(client);
  });

  const result = await sendDisputeMessage(
    'dispute-1',
    'both',
    'Please review the new evidence and reply through your support case.',
    'admin-1',
  );

  const notificationWrites = calls.filter((call) => /INSERT INTO notifications/.test(call.sql));
  expect(notificationWrites).toHaveLength(2);
  expect(notificationWrites.map((call) => call.params[0])).toEqual(['customer-1', 'provider-user-1']);
  expect(notificationWrites.every((call) => call.params[2] === 'Please review the new evidence and reply through your support case.')).toBe(true);
  expect(calls.filter((call) => /INSERT INTO admin_actions/.test(call.sql))).toHaveLength(1);
  expect(result).toMatchObject({
    deliveredTo: ['customer', 'provider'],
    notificationIds: ['notification-1', 'notification-2'],
    adminActionId: 'audit-1',
  });
  expect(deliverStoredNotificationPushMock).toHaveBeenCalledTimes(2);
});
