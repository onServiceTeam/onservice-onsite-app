const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getFeedbackHistoryForAdmin } from '../src/services/feedback-admin.service';

it('Bug UX-872 — feedback history rejects a missing record instead of presenting a false empty history', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [{ exists: false }] });

  await expect(getFeedbackHistoryForAdmin(
    '11111111-1111-4111-8111-111111111111',
    'admin',
  )).rejects.toMatchObject({ statusCode: 404 });
  expect(dbQueryMock).toHaveBeenCalledTimes(1);
});
