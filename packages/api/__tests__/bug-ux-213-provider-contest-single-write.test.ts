const queryMock = jest.fn();
const transactionMock = jest.fn();
const emitAdminMock = jest.fn();

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

import { addProviderResponse } from '../src/services/dispute.service';

it('Bug UX-213 — a stale duplicate provider contest cannot overwrite the first response or send another notification', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 'dispute-1', booking_id: 'booking-1', status: 'open', provider_response: null }] })
    .mockResolvedValueOnce({ rows: [{ id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1', total_amount: '100000' }] })
    .mockResolvedValueOnce({ rows: [{ user_id: 'provider-user-1' }] });

  const transactionQueries: string[] = [];
  transactionMock.mockImplementationOnce(async (callback: (client: { query: (sql: string) => Promise<unknown> }) => Promise<unknown>) => {
    const client = {
      query: jest.fn(async (sql: string) => {
        transactionQueries.push(sql);
        if (sql.includes('UPDATE disputes SET')) return { rows: [], rowCount: 0 };
        throw new Error('No later query should run after the guarded update loses the race.');
      }),
    };
    return callback(client);
  });

  await expect(addProviderResponse(
    'dispute-1',
    'provider-user-1',
    'This stale response should not overwrite the first response.',
    'contest',
  )).rejects.toMatchObject({ statusCode: 409 });

  expect(transactionQueries).toHaveLength(1);
  expect(transactionQueries[0]).toContain("status = 'open'");
  expect(transactionQueries[0]).toContain('provider_response IS NULL');
  expect(emitAdminMock).not.toHaveBeenCalled();
});
