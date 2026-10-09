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

it('Bug OPS-285 — replaying one support-linked refund request cannot move money twice', async () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  const adminId = '22222222-2222-4222-8222-222222222222';
  const supportTicketId = '33333333-3333-4333-8333-333333333333';
  const idempotencyKey = '44444444-4444-4444-8444-444444444444';
  let run = 0;
  transactionMock.mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => {
    run += 1;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("FROM admin_actions") && run === 2) {
        return { rows: [{
          id: 'action-285',
          reason: 'Customer support adjustment',
          details: {
            bookingId,
            supportTicketId,
            refundAmount: 2500,
            remainingEscrowAmount: 7500,
            customerWalletCredited: false,
            paymentRetryId: '55555555-5555-4555-8555-555555555555',
          },
        }], rowCount: 1 };
      }
      if (sql.includes('SELECT status FROM gateway_retry_queue')) {
        return { rows: [{ status: 'succeeded' }], rowCount: 1 };
      }
      if (sql.includes('FROM support_tickets')) {
        return { rows: [{ id: supportTicketId, ticket_number: 'SUP-285' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO admin_actions')) {
        return { rows: [{ id: 'action-285' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO gateway_retry_queue')) {
        return { rows: [{ id: '55555555-5555-4555-8555-555555555555' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    return callback({ query });
  });
  refundInTransactionMock.mockResolvedValue({
    remainingEscrowCentavos: 7500,
    paymentMethod: 'gcash',
    customerWalletCredited: false,
  });
  processRefundMock.mockResolvedValue(undefined);

  const first = await refundBookingEscrow(
    bookingId, 2500, 'Customer support adjustment', adminId, supportTicketId, idempotencyKey,
  );
  const replay = await refundBookingEscrow(
    bookingId, 2500, 'Customer support adjustment', adminId, supportTicketId, idempotencyKey,
  );

  expect(first.idempotentReplay).toBe(false);
  expect(replay.idempotentReplay).toBe(true);
  expect(refundInTransactionMock).toHaveBeenCalledTimes(1);
  expect(processRefundMock).toHaveBeenCalledTimes(1);
});
