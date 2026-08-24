const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ sendPushNotification: jest.fn() }));

import { getCategoryInsights } from '../src/services/provider-crm.service';

it('Bug UX-285 — provider category value sums completed bookings only and exposes an explicitly named completed metric', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      category_id: 'category-1', category_name: 'Aircon', job_count: '5',
      completed_count: '3', completed_value: '150000', avg_rating: '4.4',
    }],
    rowCount: 1,
  });

  const result = await getCategoryInsights('provider-1');

  expect(dbQueryMock.mock.calls[0][0]).toMatch(/SUM\(b\.service_price\) FILTER \(WHERE b\.status = ANY\(\$2\)\)/);
  expect(result[0]).toMatchObject({
    categoryName: 'Aircon', jobCount: 5, completedCount: 3,
    completionRate: 60, completedValue: 150000, avgRating: 4.4,
  });
  expect(result[0]).not.toHaveProperty('totalValue');
});
