const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/upload.service', () => ({ savePrivateArtifact: jest.fn(), getPrivateArtifactStream: jest.fn(), deletePrivateArtifact: jest.fn() }));

import { processExpiredCoolingOff } from '../src/services/data-management.service';

it('BUG-UX-183 — deletion is deferred when a booking becomes active during cooling-off', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 'delete-1', user_id: 'user-1', status: 'processing' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ has_active_bookings: true, has_active_disputes: false, available_balance: '0', pending_balance: '0' }] })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await expect(processExpiredCoolingOff()).resolves.toBe(0);

  expect(transactionMock).not.toHaveBeenCalled();
  expect(String(queryMock.mock.calls[2]![0])).toContain("SET status = 'cooling_off'");
  expect(queryMock.mock.calls[2]![1]).toEqual(['delete-1']);
});
