/**
 * Admin booking support-message behavior.
 *
 * The durable system message and booking audit entry share one transaction.
 * Participant notifications and sockets run only after that commit succeeds.
 */

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));

const loggerWarn = jest.fn();
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const createPushNotificationMock = jest.fn();
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => createPushNotificationMock(...args),
}));

const emitToConversationMock = jest.fn();
const emitToUserMock = jest.fn();
jest.mock('../src/services/socket.service', () => ({
  ADMIN_EVENTS: { BOOKING_PROVIDER_ASSIGNED: 'booking:provider_assigned' },
  emitAdminEvent: jest.fn(),
  emitToConversation: (...args: unknown[]) => emitToConversationMock(...args),
  emitToUser: (...args: unknown[]) => emitToUserMock(...args),
}));

import { sendAdminMessageToBookingParticipants } from '../src/services/booking-admin.service';

type QueryResult<T> = { rows: T[]; rowCount: number };
type TxQuery = (sql: string, params?: unknown[]) => Promise<QueryResult<unknown>>;

function rows<T>(data: T[]): QueryResult<T> {
  return { rows: data, rowCount: data.length };
}

const BOOKING_ID = 'b0000000-0000-0000-0000-000000000001';
const CUSTOMER_ID = 'c0000000-0000-0000-0000-000000000001';
const PROVIDER_USER_ID = 'p0000000-0000-0000-0000-000000000001';
const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const CONVERSATION_ID = 'v0000000-0000-0000-0000-000000000001';
const MESSAGE_ID = 'm0000000-0000-0000-0000-000000000001';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  createPushNotificationMock.mockReset();
  emitToConversationMock.mockReset();
  emitToUserMock.mockReset();
  loggerWarn.mockReset();
});

it('Bug UX-469 — commits the participant message and booking audit atomically before notifying both parties', async () => {
  const txQuery = jest.fn(async (sql: string): Promise<QueryResult<unknown>> => {
    if (/FROM bookings b/.test(sql)) {
      return rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: PROVIDER_USER_ID }]);
    }
    if (/INSERT INTO conversations/.test(sql)) return rows([{ id: CONVERSATION_ID }]);
    if (/INSERT INTO messages/.test(sql)) return rows([{ id: MESSAGE_ID }]);
    if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'action-1' }]);
    return rows([]);
  });
  dbTransactionMock.mockImplementationOnce(async (callback: (client: { query: TxQuery }) => Promise<unknown>) => (
    callback({ query: txQuery })
  ));
  createPushNotificationMock
    .mockResolvedValueOnce({ id: 'customer-notification' })
    .mockResolvedValueOnce({ id: 'provider-notification' });

  const result = await sendAdminMessageToBookingParticipants(
    BOOKING_ID,
    'Support has reviewed this booking and is checking in with both parties.',
    ADMIN_ID,
  );

  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  const auditCall = txQuery.mock.calls.find(([sql]) => /INSERT INTO admin_actions/.test(sql));
  expect(auditCall).toBeDefined();
  expect(auditCall?.[1]?.[1]).toBe(BOOKING_ID);
  expect(JSON.parse(String(auditCall?.[1]?.[2]))).toMatchObject({
    bookingId: BOOKING_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    audience: 'booking_participants',
  });
  expect(createPushNotificationMock).toHaveBeenCalledTimes(2);
  expect(emitToConversationMock).toHaveBeenCalledWith(
    CONVERSATION_ID,
    'new:message',
    expect.objectContaining({ id: MESSAGE_ID, senderRole: 'admin' }),
  );
  expect(emitToUserMock).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({
    bookingId: BOOKING_ID,
    customerId: CUSTOMER_ID,
    providerUserId: PROVIDER_USER_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    customerNotificationId: 'customer-notification',
    providerNotificationId: 'provider-notification',
  });
});

it('sends a pre-assignment booking update only to the customer without fabricating a conversation', async () => {
  const txQuery = jest.fn(async (sql: string): Promise<QueryResult<unknown>> => {
    if (/FROM bookings b/.test(sql)) {
      return rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: null }]);
    }
    if (/INSERT INTO admin_actions/.test(sql)) return rows([{ id: 'action-2' }]);
    return rows([]);
  });
  dbTransactionMock.mockImplementationOnce(async (callback: (client: { query: TxQuery }) => Promise<unknown>) => (
    callback({ query: txQuery })
  ));
  createPushNotificationMock.mockResolvedValueOnce({ id: 'customer-notification' });

  const result = await sendAdminMessageToBookingParticipants(
    BOOKING_ID,
    'Support is still finding the right provider for your booking.',
    ADMIN_ID,
  );

  expect(txQuery.mock.calls.some(([sql]) => /INSERT INTO conversations|INSERT INTO messages/.test(sql))).toBe(false);
  expect(createPushNotificationMock).toHaveBeenCalledTimes(1);
  expect(emitToConversationMock).not.toHaveBeenCalled();
  expect(result).toMatchObject({ conversationId: null, messageId: null, providerUserId: null });
});

it('rolls back the support message when its audit entry cannot be recorded', async () => {
  const txQuery = jest.fn(async (sql: string): Promise<QueryResult<unknown>> => {
    if (/FROM bookings b/.test(sql)) {
      return rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID, provider_user_id: PROVIDER_USER_ID }]);
    }
    if (/INSERT INTO conversations/.test(sql)) return rows([{ id: CONVERSATION_ID }]);
    if (/INSERT INTO messages/.test(sql)) return rows([{ id: MESSAGE_ID }]);
    if (/INSERT INTO admin_actions/.test(sql)) throw new Error('audit insert failed');
    return rows([]);
  });
  dbTransactionMock.mockImplementationOnce(async (callback: (client: { query: TxQuery }) => Promise<unknown>) => (
    callback({ query: txQuery })
  ));

  await expect(sendAdminMessageToBookingParticipants(
    BOOKING_ID,
    'This update must never exist without its support audit entry.',
    ADMIN_ID,
  )).rejects.toThrow('audit insert failed');

  expect(createPushNotificationMock).not.toHaveBeenCalled();
  expect(emitToConversationMock).not.toHaveBeenCalled();
  expect(emitToUserMock).not.toHaveBeenCalled();
});
