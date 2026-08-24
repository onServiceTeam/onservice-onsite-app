const dbQueryMock = jest.fn();
const notificationMock = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: async (callback: (client: { query: typeof dbQueryMock }) => unknown) => callback({ query: dbQueryMock }),
  },
}));

jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => notificationMock(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { decide } from '../src/services/service-area-change.service';

it('Bug UX-261 — approval atomically applies the reviewed radius, coordinates, labels, primary area, audit, and provider notification', async () => {
  const now = new Date('2026-08-25T00:00:00.000Z');
  const pending = {
    id: 'change-1', provider_id: 'user-1', current_area_id: 'area-1',
    requested_area_id: 'area-2', current_radius_km: 15, requested_radius_km: 25,
    requested_latitude: '10.3157', requested_longitude: '123.8854',
    requested_city: 'Cebu City', requested_province: 'Cebu', reason: 'Moved workshop',
    status: 'pending', reviewed_by: null, reviewed_at: null, decision_reason: null,
    created_at: now, updated_at: now,
  };
  const approved = {
    ...pending, status: 'approved', reviewed_by: 'admin-1', reviewed_at: now,
    decision_reason: 'Verified the provider pin and active market coverage.',
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
    .mockResolvedValueOnce({ rows: [approved], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{ id: 'provider-1', status: 'approved', service_radius_km: 15, current_area_id: 'area-1' }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }], rowCount: 1 });

  const result = await decide({
    changeId: 'change-1',
    adminUserId: 'admin-1',
    decision: 'approved',
    reason: 'Verified the provider pin and active market coverage.',
  });

  expect(result.status).toBe('approved');
  const providerUpdate = dbQueryMock.mock.calls.find(([sql]) => /UPDATE providers/.test(String(sql)));
  expect(providerUpdate).toBeDefined();
  expect(providerUpdate![1]).toEqual([
    'user-1', 25, '10.3157', '123.8854', 'Cebu City', 'Cebu',
  ]);
  expect(dbQueryMock.mock.calls.some(([sql]) => /INSERT INTO provider_service_areas/.test(String(sql)))).toBe(true);
  expect(dbQueryMock.mock.calls.some(([sql]) => /INSERT INTO admin_actions/.test(String(sql)))).toBe(true);
  expect(notificationMock).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'user-1', type: 'service_area_change_approved',
  }));
});
