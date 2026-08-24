const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({ sendPushNotification: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitToUser: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getOpenJobRequestsForProvider } from '../src/services/job-leads.service';

it('Bug LINK-133 — a quote request remains discoverable to other eligible providers after its first quote', async () => {
  dbQueryMock.mockImplementation(async (sql: string) => {
    if (/FROM providers WHERE user_id/.test(sql)) {
      return { rows: [{ id: 'provider-2', latitude: '10.3157', longitude: '123.8854', service_radius_km: 20 }], rowCount: 1 };
    }
    if (/COUNT\(\*\)/.test(sql)) {
      return { rows: [{ count: sql.includes("b.status IN ('requested', 'quoted')") ? '1' : '0' }], rowCount: 1 };
    }
    if (/SELECT b\.id/.test(sql) && sql.includes("b.status IN ('requested', 'quoted')")) {
      return {
        rows: [{
          id: 'booking-quoted-1', category_id: 'category-1', category_name: 'Plumbing',
          subcategory_id: null, description: 'Repair a leaking pipe under the sink.', urgency: 'within_3_days',
          budget_min: 20_000, budget_max: 50_000, job_photos: [], job_video_url: null,
          intake_answers: null, barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
          customer_first: 'Ana', customer_last: 'Reyes', distance_km: '3.2',
          created_at: new Date('2026-08-24T00:00:00.000Z'),
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await getOpenJobRequestsForProvider('provider-user-2');

  expect(result.total).toBe(1);
  expect(result.requests[0]).toMatchObject({ id: 'booking-quoted-1', categoryName: 'Plumbing' });
});
