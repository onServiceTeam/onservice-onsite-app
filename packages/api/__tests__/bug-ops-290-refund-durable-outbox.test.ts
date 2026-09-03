const transactionMock = jest.fn();
const topQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => topQueryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrowInTransaction: jest.fn().mockResolvedValue({
    remainingEscrowCentavos: 7500,
    paymentMethod: 'gcash',
    customerWalletCredited: false,
  }),
}));
jest.mock('../src/services/payment.service', () => ({ processRefund: jest.fn().mockResolvedValue(undefined) }));
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

it('Bug OPS-290 — payment-only retry work is committed atomically with the local refund audit', async () => {
  const transactionCalls: Array<{ sql: string; params: unknown[] }> = [];
  transactionMock.mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => callback({
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      transactionCalls.push({ sql, params });
      if (sql.includes('FROM support_tickets')) {
        return { rows: [{ id: '22222222-2222-4222-8222-222222222222', ticket_number: 'SUP-290' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO gateway_retry_queue')) {
        return { rows: [{ id: '55555555-5555-4555-8555-555555555555' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO admin_actions')) {
        return { rows: [{ id: 'action-290' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
  }));
  topQueryMock.mockResolvedValue({ rows: [], rowCount: 1 });

  await refundBookingEscrow(
    '11111111-1111-4111-8111-111111111111',
    2500,
    'Support approved this partial refund',
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
  );

  const outboxIndex = transactionCalls.findIndex(({ sql }) => sql.includes('INSERT INTO gateway_retry_queue'));
  const auditIndex = transactionCalls.findIndex(({ sql }) => sql.includes('INSERT INTO admin_actions'));
  expect(outboxIndex).toBeGreaterThanOrEqual(0);
  expect(auditIndex).toBeGreaterThan(outboxIndex);
  expect(transactionCalls[outboxIndex]?.params.slice(0, 3)).toEqual([
    '11111111-1111-4111-8111-111111111111',
    2500,
    'Support approved this partial refund',
  ]);
});
