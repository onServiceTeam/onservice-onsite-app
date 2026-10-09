const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrowInTransaction: jest.fn().mockResolvedValue({
    remainingEscrowCentavos: 2000,
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

it('Bug OPS-292 — a new refund outbox row cannot race the request handler immediate attempt', async () => {
  const transactionSql: string[] = [];
  transactionMock.mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => callback({
    query: jest.fn(async (sql: string) => {
      transactionSql.push(sql);
      if (sql.includes('FROM support_tickets')) {
        return { rows: [{ id: '22222222-2222-4222-8222-222222222222', ticket_number: 'SUP-292' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO gateway_retry_queue')) {
        return { rows: [{ id: '55555555-5555-4555-8555-555555555555' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO admin_actions')) {
        return { rows: [{ id: 'action-292' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
  }));

  await refundBookingEscrow(
    '11111111-1111-4111-8111-111111111111',
    3000,
    'Support approved the refund after evidence review',
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
  );

  const outboxInsert = transactionSql.find((sql) => sql.includes('INSERT INTO gateway_retry_queue'));
  expect(outboxInsert).toMatch(/next_retry_at[\s\S]*NOW\(\) \+ INTERVAL '10 minutes'/);
});
