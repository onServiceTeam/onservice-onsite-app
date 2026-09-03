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

import { blockIp } from '../src/services/security.service';

it('Bug OPS-377 — an IP block rolls back when its security-event evidence cannot be written', async () => {
  transactionMock.mockImplementationOnce(async (callback: unknown) => (
    (callback as (client: { query: typeof transactionQueryMock }) => Promise<unknown>)({ query: transactionQueryMock })
  ));
  transactionQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'block-377',
        ip_address: '203.0.113.77',
        reason: 'Repeated credential attacks verified by support.',
        blocked_by: '37700000-0000-4000-8000-000000000377',
        expires_at: new Date('2026-09-04T00:00:00.000Z'),
        is_active: true,
        created_at: new Date('2026-09-03T00:00:00.000Z'),
      }],
      rowCount: 1,
    })
    .mockRejectedValueOnce(new Error('security event insert failed'));

  await expect(blockIp({
    ipAddress: '203.0.113.77',
    reason: 'Repeated credential attacks verified by support.',
    blockedBy: '37700000-0000-4000-8000-000000000377',
    expiresInHours: 24,
  })).rejects.toThrow('security event insert failed');

  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(rootQueryMock).not.toHaveBeenCalled();
  expect(transactionQueryMock.mock.calls[2]?.[0]).toMatch(/INSERT INTO security_events/);
});
