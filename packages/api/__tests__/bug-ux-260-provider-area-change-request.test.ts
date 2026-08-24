const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(30),
}));

jest.mock('../src/services/notification.service', () => ({
  createPushNotification: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { requestChange } from '../src/services/service-area-change.service';

it('Bug UX-260 — a provider change request obeys the live radius cap and snapshots the reviewed location without changing the provider', async () => {
  await expect(requestChange({
    providerId: 'user-1',
    requestedAreaId: 'area-2',
    requestedRadiusKm: 31,
    requestedLatitude: 10.3157,
    requestedLongitude: 123.8854,
  })).rejects.toMatchObject({ statusCode: 400 });
  expect(dbQueryMock).not.toHaveBeenCalled();

  const now = new Date('2026-08-25T00:00:00.000Z');
  dbQueryMock
    .mockResolvedValueOnce({
      rows: [{
        provider_record_id: 'provider-1', provider_status: 'approved',
        service_radius_km: 15, latitude: '10.3157', longitude: '123.8854',
        current_area_id: 'area-1', current_area_name: 'Mandaue',
        current_area_city: 'Mandaue', current_area_province: 'Cebu',
        current_area_lat: '10.3236', current_area_lng: '123.9223',
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'area-2', name: 'Cebu City', city: 'Cebu City', province: 'Cebu',
        center_lat: '10.3157', center_lng: '123.8854', radius_km: 15, status: 'active',
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'change-1', provider_id: 'user-1', current_area_id: 'area-1',
        requested_area_id: 'area-2', current_radius_km: 15, requested_radius_km: 25,
        requested_latitude: '10.3157', requested_longitude: '123.8854',
        requested_city: 'Cebu City', requested_province: 'Cebu', reason: 'Moved workshop',
        status: 'pending', reviewed_by: null, reviewed_at: null, decision_reason: null,
        created_at: now, updated_at: now,
      }],
      rowCount: 1,
    });

  const result = await requestChange({
    providerId: 'user-1',
    requestedAreaId: 'area-2',
    requestedRadiusKm: 25,
    requestedLatitude: 10.3157,
    requestedLongitude: 123.8854,
    reason: '  Moved workshop  ',
  });

  expect(result).toMatchObject({
    status: 'pending', requestedAreaId: 'area-2', requestedRadiusKm: 25,
    requestedLatitude: 10.3157, requestedLongitude: 123.8854,
  });
  const insertCall = dbQueryMock.mock.calls.find(([sql]) => /INSERT INTO service_area_change_requests/.test(String(sql)));
  expect(insertCall).toBeDefined();
  expect(insertCall![1]).toEqual([
    'user-1', 'area-1', 15, 'area-2', 25,
    10.3157, 123.8854, 'Cebu City', 'Cebu', 'Moved workshop',
  ]);
  expect(dbQueryMock.mock.calls.some(([sql]) => /UPDATE providers/.test(String(sql)))).toBe(false);
});
