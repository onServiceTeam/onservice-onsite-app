const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));
jest.mock('../src/config/platform.config', () => ({
  platformConfig: { otpLockoutThresholds: [], maxPageSize: 100 },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { unblockIp } from '../src/services/security.service';

it('Bug OPS-362 — manual IP unblock records the operator reason in the security timeline', async () => {
  dbTransactionMock.mockImplementationOnce(async (callback: unknown) => (
    (callback as (client: { query: typeof dbQueryMock }) => Promise<unknown>)({ query: dbQueryMock })
  ));
  dbQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await expect(unblockIp(
    '203.0.113.36',
    '36000000-0000-4000-8000-000000000036',
    'Verified shared-office address after customer support review.',
  )).resolves.toBe(true);

  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock).toHaveBeenNthCalledWith(
    2,
    expect.stringMatching(/INSERT INTO security_events/),
    [
      '36000000-0000-4000-8000-000000000036',
      'ip_unblocked',
      '203.0.113.36',
      null,
      JSON.stringify({ reason: 'Verified shared-office address after customer support review.' }),
    ],
  );
});
