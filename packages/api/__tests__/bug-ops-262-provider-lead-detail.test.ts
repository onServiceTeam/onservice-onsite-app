const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({ sendPushNotification: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitToUser: jest.fn() }));

import { getOpenJobRequestForProvider } from '../src/services/job-leads.service';

it('Bug OPS-262 — an eligible provider can open a redacted quote lead without using the assigned-booking endpoint', async () => {
  dbQueryMock
    .mockResolvedValueOnce({
      rows: [{ id: 'provider-1', latitude: '10.3', longitude: '123.9', service_radius_km: 15 }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'booking-1', category_id: 'category-1', category_name: 'Plumbing', service_name: 'Sink repair',
        subcategory_id: null, description: 'Repair the leaking sink drain', urgency: 'same_day',
        budget_min: 50000, budget_max: 150000, job_photos: ['job/photo.jpg'],
        job_video_url: null, intake_answers: { sink_type: 'Double bowl' },
        barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
        customer_first: 'Customer', customer_last: 'One', distance_km: '3.456',
        created_at: new Date('2026-09-01T00:00:00.000Z'),
      }],
      rowCount: 1,
    });

  const request = await getOpenJobRequestForProvider('provider-user-1', 'booking-1');

  expect(request).toMatchObject({
    id: 'booking-1', categoryName: 'Plumbing', serviceName: 'Sink repair',
    customerName: 'Customer One', distanceKm: 3.5,
  });
  expect(request).not.toHaveProperty('address');
  expect(request).not.toHaveProperty('latitude');
  expect(request).not.toHaveProperty('longitude');
  const sql = String(dbQueryMock.mock.calls[1]?.[0]);
  expect(sql).toContain("b.booking_type = 'quote_based'");
  expect(sql).toContain('provider_services');
  expect(sql).toContain("q2.status = 'accepted'");
  expect(dbQueryMock.mock.calls[1]?.[1]).toEqual(['provider-1', '10.3', '123.9', 15, 'booking-1']);
});
