/**
 * Phase 13 Dispatch C — Admin → customer message audit tests.
 *
 * Verifies that sendAdminMessageToBookingCustomer writes an admin_actions
 * row with verb 'admin_message_sent' and target_type 'message' (allowed by
 * migration 058). Audit insert failure must NOT abort the message send.
 */

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

const loggerWarn = jest.fn();
const loggerInfo = jest.fn();
const loggerError = jest.fn();
const loggerDebug = jest.fn();

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: (...a: unknown[]) => loggerInfo(...a),
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: (...a: unknown[]) => loggerError(...a),
    debug: (...a: unknown[]) => loggerDebug(...a),
  },
}));

const createNotificationMock = jest.fn();

jest.mock('../src/services/notification.service', () => ({
  createNotification: (...args: unknown[]) => createNotificationMock(...args),
}));

import * as bookingAdminSvc from '../src/services/booking-admin.service';

type QueryResult<T> = { rows: T[]; rowCount: number };
function rows<T>(data: T[]): QueryResult<T> {
  return { rows: data, rowCount: data.length };
}

const BOOKING_ID = 'b0000000-0000-0000-0000-000000000001';
const CUSTOMER_ID = 'c0000000-0000-0000-0000-000000000001';
const ADMIN_ID = 'a0000000-0000-0000-0000-000000000001';
const CONVO_ID = 'v0000000-0000-0000-0000-000000000001';
const MESSAGE_ID = 'm0000000-0000-0000-0000-000000000001';
const NOTIFICATION_ID = 'n0000000-0000-0000-0000-000000000001';

beforeEach(() => {
  dbQueryMock.mockReset();
  loggerWarn.mockReset();
  loggerInfo.mockReset();
  loggerError.mockReset();
  loggerDebug.mockReset();
  createNotificationMock.mockReset();
  createNotificationMock.mockResolvedValue({ id: NOTIFICATION_ID });
});

describe('sendAdminMessageToBookingCustomer — admin_actions audit', () => {
  it('writes admin_message_sent / message audit with target_id=messageId when conversation exists', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID }])) // SELECT booking
      .mockResolvedValueOnce(rows([{ id: CONVO_ID }]))                              // SELECT conversation
      .mockResolvedValueOnce(rows([{ id: MESSAGE_ID }]))                            // INSERT messages
      .mockResolvedValueOnce(rows([]))                                              // UPDATE conversations
      .mockResolvedValueOnce(rows([]));                                             // INSERT admin_actions

    const out = await bookingAdminSvc.sendAdminMessageToBookingCustomer(
      BOOKING_ID,
      'Hello, this is the support team checking in on your booking.',
      ADMIN_ID,
    );

    expect(out.messageId).toBe(MESSAGE_ID);
    expect(out.conversationId).toBe(CONVO_ID);

    const auditCall = dbQueryMock.mock.calls[4];
    const auditSql = auditCall[0] as string;
    const auditParams = auditCall[1] as unknown[];
    expect(auditSql).toMatch(/INSERT INTO admin_actions/);
    expect(auditSql).toMatch(/'admin_message_sent'/);
    expect(auditSql).toMatch(/'message'/);
    expect(auditParams[0]).toBe(ADMIN_ID);
    expect(auditParams[1]).toBe(MESSAGE_ID);
    const details = JSON.parse(auditParams[2] as string) as Record<string, unknown>;
    expect(details.bookingId).toBe(BOOKING_ID);
    expect(details.conversationId).toBe(CONVO_ID);
    expect(details.messageId).toBe(MESSAGE_ID);
    expect(details.notificationId).toBe(NOTIFICATION_ID);
  });

  it('uses bookingId as audit target_id when no conversation exists', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID }])) // SELECT booking
      .mockResolvedValueOnce(rows([]))                                              // SELECT conversation -> none
      .mockResolvedValueOnce(rows([]));                                             // INSERT admin_actions

    const out = await bookingAdminSvc.sendAdminMessageToBookingCustomer(
      BOOKING_ID,
      'Hello, this is the support team checking in on your booking.',
      ADMIN_ID,
    );

    expect(out.messageId).toBeNull();
    expect(out.conversationId).toBeNull();

    const auditCall = dbQueryMock.mock.calls[2];
    const auditParams = auditCall[1] as unknown[];
    expect(auditParams[0]).toBe(ADMIN_ID);
    expect(auditParams[1]).toBe(BOOKING_ID);
    const details = JSON.parse(auditParams[2] as string) as Record<string, unknown>;
    expect(details.messageId).toBeNull();
    expect(details.conversationId).toBeNull();
  });

  it('still resolves when audit insert throws (warn logged, message send not aborted)', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ id: BOOKING_ID, customer_id: CUSTOMER_ID }])) // SELECT booking
      .mockResolvedValueOnce(rows([]))                                              // SELECT conversation -> none
      .mockRejectedValueOnce(new Error('audit boom'));                              // INSERT admin_actions fails

    const out = await bookingAdminSvc.sendAdminMessageToBookingCustomer(
      BOOKING_ID,
      'Hello, this is the support team checking in on your booking.',
      ADMIN_ID,
    );

    expect(out.notificationId).toBe(NOTIFICATION_ID);
    expect(loggerWarn).toHaveBeenCalledWith(
      'audit_log insert failed',
      expect.objectContaining({ err: expect.stringContaining('audit boom') }),
    );
  });
});
