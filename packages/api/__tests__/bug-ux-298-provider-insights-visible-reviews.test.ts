const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { getCategoryInsights } from '../src/services/provider-crm.service';

it('Bug UX-298 — provider category insight ratings include only customer reviews that remain visible', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await getCategoryInsights('provider-1');

  expect(dbQueryMock.mock.calls[0][0]).toMatch(
    /LEFT JOIN reviews r ON r\.booking_id = b\.id AND r\.is_visible = TRUE/,
  );
});
