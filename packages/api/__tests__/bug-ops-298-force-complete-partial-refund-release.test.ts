const transactionMock = jest.fn();
const releaseEscrowMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/services/escrow.service', () => ({
  releaseEscrowInTransaction: (...args: unknown[]) => releaseEscrowMock(...args),
}));
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

import { forceCompleteBooking } from '../src/services/booking-admin.service';

it('Bug OPS-298 — force-complete releases the provider remainder after a partial refund', async () => {
  let queryNumber = 0;
  transactionMock.mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => {
    const client = {
      query: jest.fn(async (sql: string) => {
        queryNumber += 1;
        if (queryNumber === 1) return { rows: [{ id: 'booking-298', status: 'completed_by_provider' }], rowCount: 1 };
        if (sql.includes('SELECT escrow_status')) {
          return { rows: [{ escrow_status: 'partially_refunded' }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO admin_actions')) return { rows: [{ id: 'action-298' }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
    };
    const result = await callback(client);
    expect(releaseEscrowMock).toHaveBeenCalledWith(client, 'booking-298');
    return result;
  });

  await forceCompleteBooking(
    'booking-298',
    'Support verified all completion evidence after the partial refund',
    'admin-298',
  );

  expect(releaseEscrowMock).toHaveBeenCalledTimes(1);
});
