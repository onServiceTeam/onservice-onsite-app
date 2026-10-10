const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/services/escrow.service', () => ({ refundFromEscrowInTransaction: jest.fn() }));
jest.mock('../src/services/payment.service', () => ({ processRefund: jest.fn() }));
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

it('Bug OPS-293 — a permanently failed refund replay is reported as manual attention, not queued', async () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  const supportTicketId = '22222222-2222-4222-8222-222222222222';
  transactionMock.mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => callback({
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM admin_actions')) {
        return {
          rows: [{
            id: 'action-293',
            reason: 'Support approved this refund after review',
            details: {
              bookingId,
              supportTicketId,
              refundAmount: 3000,
              remainingEscrowAmount: 2000,
              customerWalletCredited: false,
              paymentRetryId: '55555555-5555-4555-8555-555555555555',
            },
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT status FROM gateway_retry_queue')) {
        return { rows: [{ status: 'failed_permanent' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
  }));

  const result = await refundBookingEscrow(
    bookingId,
    3000,
    'Support approved this refund after review',
    '33333333-3333-4333-8333-333333333333',
    supportTicketId,
    '44444444-4444-4444-8444-444444444444',
  );

  expect(result.paymentProcessingStatus).toBe('manual_attention');
  expect(result.paymentProcessingQueued).toBe(false);
});
