const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { addMember } from '../src/services/business.service';

it('Bug OPS-360 — a company member must resolve to an active customer identity before membership is written', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ role: 'owner' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await expect(addMember(
    '36036036-0360-4360-8360-360360360360',
    '36036036-0360-4360-8360-360360360361',
    '36036036-0360-4360-8360-360360360362',
    'member',
    {},
  )).rejects.toMatchObject({ statusCode: 404, message: 'Target user not found.' });

  expect(queryMock).toHaveBeenCalledTimes(2);
  expect(String(queryMock.mock.calls[1]![0])).toContain("role = 'customer'");
  expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO business_members'))).toBe(false);
});
