const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: async (callback: (client: { query: typeof dbQueryMock }) => unknown) => callback({ query: dbQueryMock }),
  },
}));

jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { decide } from '../src/services/service-area-change.service';

it('Bug UX-267 — approval refuses to overwrite provider coverage that changed after the request snapshot', async () => {
  const now = new Date('2026-08-25T00:00:00.000Z');
  const pending = {
    id: 'change-1', provider_id: 'user-1', current_area_id: 'area-1',
    requested_area_id: 'area-2', current_radius_km: 15, requested_radius_km: 25,
    requested_latitude: '10.3157', requested_longitude: '123.8854',
    requested_city: 'Cebu City', requested_province: 'Cebu', reason: 'Moved workshop',
    status: 'pending', reviewed_by: null, reviewed_at: null, decision_reason: null,
    created_at: now, updated_at: now,
  };
  dbQueryMock
    .mockResolvedValueOnce({ rows: [pending], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'area-2', name: 'Cebu City', city: 'Cebu City', province: 'Cebu',
        center_lat: '10.3157', center_lng: '123.8854', radius_km: 15, status: 'active',
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ ...pending, status: 'approved' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{ id: 'provider-1', status: 'approved', service_radius_km: 30, current_area_id: 'area-1' }],
      rowCount: 1,
    });

  await expect(decide({
    changeId: 'change-1',
    adminUserId: 'admin-1',
    decision: 'approved',
    reason: 'Verified the provider pin and active market coverage.',
  })).rejects.toThrow(/coverage changed after this request/);

  expect(dbQueryMock.mock.calls.some(([sql]) => /UPDATE providers/.test(String(sql)))).toBe(false);
});
