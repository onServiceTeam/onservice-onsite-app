const rootQueryMock = jest.fn();
const transactionMock = jest.fn();
const transactionQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => rootQueryMock(...args),
    transaction: (callback: unknown) => transactionMock(callback),
  },
}));
jest.mock('../src/config/platform.config', () => ({
  platformConfig: { otpLockoutThresholds: [], maxPageSize: 100 },
}));
jest.mock('../src/services/settings.service', () => ({ getSettingInteger: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { unblockIp } from '../src/services/security.service';

it('Bug OPS-378 — an IP unblock rolls back when its security-event evidence cannot be written', async () => {
  transactionMock.mockImplementationOnce(async (callback: unknown) => (
    (callback as (client: { query: typeof transactionQueryMock }) => Promise<unknown>)({ query: transactionQueryMock })
  ));
  transactionQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockRejectedValueOnce(new Error('security event insert failed'));

  await expect(unblockIp(
    '203.0.113.78',
    '37800000-0000-4000-8000-000000000378',
    'Support verified that this is a shared carrier address.',
  )).rejects.toThrow('security event insert failed');

  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(rootQueryMock).not.toHaveBeenCalled();
  expect(transactionQueryMock.mock.calls[1]?.[0]).toMatch(/INSERT INTO security_events/);
});
