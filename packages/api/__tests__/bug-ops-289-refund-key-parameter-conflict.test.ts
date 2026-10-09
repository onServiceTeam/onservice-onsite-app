const transactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
const refundInTransactionMock = jest.fn();
jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrowInTransaction: (...args: unknown[]) => refundInTransactionMock(...args),
}));
const processRefundMock = jest.fn();
jest.mock('../src/services/payment.service', () => ({
  processRefund: (...args: unknown[]) => processRefundMock(...args),
}));
jest.mock('../src/services/gateway-retry.service', () => ({ enqueueRetry: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/or.service', () => ({ issueOR: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitAdminEvent: jest.fn(), ADMIN_EVENTS: {} }));
jest.mock('../src/services/matching.service', () => ({}));
jest.mock('../src/services/booking-financial-terms.service', () => ({}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { refundBookingEscrow } from '../src/services/booking-admin.service';

it('Bug OPS-289 — a refund request key cannot be reused with a different amount', async () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  const supportTicketId = '22222222-2222-4222-8222-222222222222';
  const idempotencyKey = '33333333-3333-4333-8333-333333333333';
  transactionMock.mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => (
    callback({
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM admin_actions')) {
          return {
            rows: [{
              id: 'action-289',
              reason: 'Original support-approved refund',
              details: { bookingId, supportTicketId, refundAmount: 2500 },
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      }),
    })
  ));

  await expect(refundBookingEscrow(
    bookingId,
    5000,
    'Original support-approved refund',
    '44444444-4444-4444-8444-444444444444',
    supportTicketId,
    idempotencyKey,
  )).rejects.toMatchObject({ statusCode: 409 });

  expect(refundInTransactionMock).not.toHaveBeenCalled();
  expect(processRefundMock).not.toHaveBeenCalled();
});
