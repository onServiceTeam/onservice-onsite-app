const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getById } from '../src/services/service-area-change.service';

it('Bug OPS-418 - exact area-change evidence retains a completed decision and resolves its Provider 360 owner', async () => {
  const changeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const decidedAt = new Date('2026-09-03T04:00:00.000Z');
  queryMock.mockResolvedValueOnce({
    rows: [{
      id: changeId, provider_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      provider_record_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      provider_name: 'Cebu Home Pro', provider_email: 'ops@example.com', provider_phone: '+639171234567',
      current_area_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', current_area_name: 'Mandaue',
      requested_area_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', requested_area_name: 'Cebu City',
      current_radius_km: 15, requested_radius_km: 25,
      requested_latitude: '10.3157', requested_longitude: '123.8854',
      requested_city: 'Cebu City', requested_province: 'Cebu', reason: 'Workshop relocation',
      status: 'approved', reviewed_by: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      reviewed_at: decidedAt, decision_reason: 'Verified the provider pin and active market coverage.',
      created_at: new Date('2026-09-02T04:00:00.000Z'), updated_at: decidedAt,
    }],
    rowCount: 1,
  });

  await expect(getById(changeId)).resolves.toMatchObject({
    id: changeId,
    status: 'approved',
    providerRecordId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    requestedAreaName: 'Cebu City',
    decisionReason: 'Verified the provider pin and active market coverage.',
    reviewedAt: decidedAt.toISOString(),
  });
  expect(queryMock).toHaveBeenCalledWith(
    expect.stringMatching(/FROM service_area_change_requests acr[\s\S]*LEFT JOIN providers[\s\S]*WHERE acr\.id = \$1/),
    [changeId],
  );
  expect(String(queryMock.mock.calls[0]?.[0])).not.toMatch(/acr\.status = 'pending'/);
});
