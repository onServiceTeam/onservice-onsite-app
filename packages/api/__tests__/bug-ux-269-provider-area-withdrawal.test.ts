const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn(),
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { cancelPending } from '../src/services/service-area-change.service';

it('Bug UX-269 — a provider can withdraw only their own pending area-change request without changing active coverage', async () => {
  const now = new Date('2026-08-25T00:00:00.000Z');
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: 'change-1', provider_id: 'user-1', current_area_id: 'area-1',
      requested_area_id: 'area-2', current_radius_km: 15, requested_radius_km: 25,
      requested_latitude: '10.3157', requested_longitude: '123.8854',
      requested_city: 'Cebu City', requested_province: 'Cebu', reason: 'Moved workshop',
      status: 'cancelled', reviewed_by: null, reviewed_at: null, decision_reason: null,
      created_at: now, updated_at: now,
    }],
    rowCount: 1,
  });

  const result = await cancelPending('user-1');

  expect(result.status).toBe('cancelled');
  expect(dbQueryMock).toHaveBeenCalledWith(expect.stringMatching(/provider_id = \$1 AND status = 'pending'/), ['user-1']);
  expect(dbQueryMock.mock.calls.some(([sql]) => /UPDATE providers/.test(String(sql)))).toBe(false);
});
