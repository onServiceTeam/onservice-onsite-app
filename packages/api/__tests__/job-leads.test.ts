/**
 * D27 Phase 1 — unit tests for custom-quote lead discovery.
 * Mocks db.query + the notification/socket side effects. Covers:
 *   - notifyProvidersOfJobRequest fans out to each matched provider + counts
 *   - getOpenJobRequestsForProvider 404s without a provider profile
 *   - getOpenJobRequestsForProvider maps rows, rounds distance, and the query
 *     excludes already-quoted + already-accepted requests
 */

const dbQueryMock = jest.fn();
const sendPushMock = jest.fn();
const emitToUserMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({
  sendPushNotification: (...args: unknown[]) => sendPushMock(...args),
}));
jest.mock('../src/services/socket.service', () => ({
  emitToUser: (...args: unknown[]) => emitToUserMock(...args),
}));

import * as svc from '../src/services/job-leads.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  sendPushMock.mockReset();
  emitToUserMock.mockReset();
});

function rows<T>(data: T[]): { rows: T[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const PROVIDER_USER = '22222222-2222-2222-2222-222222222222';
const BOOKING_ID = '11111111-1111-1111-1111-111111111111';

describe('notifyProvidersOfJobRequest', () => {
  it('notifies every matched provider and returns the count', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ user_id: 'u1' }, { user_id: 'u2' }])) // matched providers
      .mockResolvedValueOnce(rows([{ name: 'Plumbing' }])); // category name

    const n = await svc.notifyProvidersOfJobRequest({
      id: BOOKING_ID,
      category_id: 'cat1',
      latitude: 10.3,
      longitude: 123.9,
      city: 'Cebu City',
    });

    expect(n).toBe(2);
    expect(sendPushMock).toHaveBeenCalledTimes(2);
    expect(emitToUserMock).toHaveBeenCalledTimes(2);
    // Type + payload carry the bookingId so the provider can open it.
    expect(sendPushMock.mock.calls[0][3]).toBe('new_job_request');
    expect(sendPushMock.mock.calls[0][4]).toMatchObject({ bookingId: BOOKING_ID });
  });

  it('matches by category + service radius (query references provider_services + radius)', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([])).mockResolvedValueOnce(rows([{ name: 'x' }]));
    await svc.notifyProvidersOfJobRequest({
      id: BOOKING_ID, category_id: 'cat1', latitude: 10, longitude: 123, city: 'X',
    });
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/provider_services/);
    expect(sql).toMatch(/p\.status = 'approved'/);
    expect(sql).toMatch(/service_radius_km/);
  });
});

describe('getOpenJobRequestsForProvider', () => {
  it('404s when the caller has no provider profile', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.getOpenJobRequestsForProvider(PROVIDER_USER)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('maps rows, rounds distance, and excludes already-quoted/accepted requests', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ id: 'p1', latitude: '10.3', longitude: '123.9', service_radius_km: 15 }]))
      .mockResolvedValueOnce(rows([{ count: '1' }]))
      .mockResolvedValueOnce(
        rows([
          {
            id: BOOKING_ID,
            category_id: 'cat1',
            category_name: 'Plumbing',
            subcategory_id: null,
            description: 'Leaking pipe under the sink',
            urgency: 'same_day',
            budget_min: 50000,
            budget_max: 150000,
            job_photos: ['https://x/a.jpg'],
            job_video_url: null,
            barangay: 'Lahug',
            city: 'Cebu City',
            province: 'Cebu',
            customer_first: 'Joe',
            customer_last: 'Cust',
            distance_km: '3.456',
            created_at: new Date('2026-06-29T00:00:00Z'),
          },
        ]),
      );

    const out = await svc.getOpenJobRequestsForProvider(PROVIDER_USER, { page: 1, pageSize: 20 });
    expect(out.total).toBe(1);
    expect(out.requests).toHaveLength(1);
    expect(out.requests[0]).toMatchObject({
      id: BOOKING_ID,
      categoryName: 'Plumbing',
      customerName: 'Joe Cust',
      distanceKm: 3.5, // rounded to 1 dp
      budgetMin: 50000,
    });

    // The list query must exclude requests this provider already quoted and any
    // request that already has an accepted quote.
    const listSql = dbQueryMock.mock.calls[2][0] as string;
    expect(listSql).toMatch(/NOT EXISTS .*q\.provider_id = \$1/s);
    expect(listSql).toMatch(/q2\.status = 'accepted'/);
    expect(listSql).toMatch(/b\.status = 'requested'/);
  });
});
