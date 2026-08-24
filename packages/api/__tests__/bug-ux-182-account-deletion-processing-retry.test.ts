const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (cb: unknown) => transactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/upload.service', () => ({ savePrivateArtifact: jest.fn(), getPrivateArtifactStream: jest.fn(), deletePrivateArtifact: jest.fn() }));

import { processExpiredCoolingOff } from '../src/services/data-management.service';

it('BUG-UX-182 — an interrupted processing deletion is selected and completed by the next worker run', async () => {
  const request = { id: 'delete-1', user_id: 'user-1', status: 'processing' };
  queryMock
    .mockResolvedValueOnce({ rows: [request], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ has_active_bookings: false, has_active_disputes: false, available_balance: '0', pending_balance: '0' }] });
  transactionMock.mockRejectedValueOnce(new Error('temporary database failure'));

  await expect(processExpiredCoolingOff()).resolves.toBe(0);

  queryMock
    .mockResolvedValueOnce({ rows: [request], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ has_active_bookings: false, has_active_disputes: false, available_balance: '0', pending_balance: '0' }] })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  transactionMock.mockImplementationOnce(async (cb: unknown) => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    return (cb as (value: typeof client) => Promise<unknown>)(client);
  });

  await expect(processExpiredCoolingOff()).resolves.toBe(1);
  expect(String(queryMock.mock.calls[2]![0])).toContain("OR status = 'processing'");
});
