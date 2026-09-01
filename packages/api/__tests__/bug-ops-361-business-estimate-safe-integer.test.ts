const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createContract } from '../src/services/business.service';

it('Bug OPS-361 — a contract estimate cannot exceed JavaScript exact-integer centavo precision', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ role: 'owner', can_approve: true }], rowCount: 1 });

  await expect(createContract({
    businessAccountId: '36136136-1361-4361-8361-361361361361',
    categoryId: '36136136-1361-4361-8361-361361361362',
    contractType: 'recurring',
    agreedRate: 50_000,
    estimatedMonthlyValue: Number.MAX_SAFE_INTEGER + 1,
    startDate: '2026-09-02',
  }, '36136136-1361-4361-8361-361361361363'))
    .rejects.toMatchObject({ statusCode: 400 });

  expect(queryMock).toHaveBeenCalledTimes(1);
  expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO business_contracts'))).toBe(false);
});
