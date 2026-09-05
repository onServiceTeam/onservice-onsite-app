const mockDbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (callback: (client: { query: (...args: unknown[]) => unknown }) => unknown) =>
      callback({ query: (...args: unknown[]) => mockDbQuery(...args) }),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createProviderApplication } from '../src/services/provider.service';

it('Bug UX-529 — provider application validates its market and atomically creates the canonical primary area linkage', async () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const areaId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const providerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ role: 'customer', is_active: true, is_flagged_fraud: false }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // No active draft in this older-client fixture.
    .mockResolvedValueOnce({
      rows: [{
        id: areaId,
        name: 'Metro Cebu',
        city: 'Cebu City',
        province: 'Cebu',
        status: 'active',
        center_lat: '10.3157',
        center_lng: '123.8854',
        radius_km: 35,
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: providerId }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await createProviderApplication(userId, {
    businessName: 'Cebu Home Care',
    categoryIds: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
    serviceAreaId: areaId,
    serviceRadiusKm: 15,
    latitude: 10.32,
    longitude: 123.89,
    city: 'Client supplied city must not win',
    province: 'Client supplied province must not win',
    governmentIdFrontUrl: `https://cdn.example/onboarding/${userId}/front.jpg`,
    governmentIdBackUrl: `https://cdn.example/onboarding/${userId}/back.jpg`,
    nbiClearanceUrl: `https://cdn.example/onboarding/${userId}/nbi.jpg`,
    selfieUrl: `https://cdn.example/onboarding/${userId}/selfie.jpg`,
  });

  const areaLookup = mockDbQuery.mock.calls.find((call) => /FROM service_areas/i.test(String(call[0])))!;
  expect(areaLookup[1]).toEqual([areaId]);

  const providerInsert = mockDbQuery.mock.calls.find((call) => /INSERT INTO providers/i.test(String(call[0])))!;
  expect(providerInsert[1][5]).toBe('Cebu City');
  expect(providerInsert[1][6]).toBe('Cebu');

  const areaLink = mockDbQuery.mock.calls.find((call) => /INSERT INTO provider_service_areas/i.test(String(call[0])))!;
  expect(areaLink[1]).toEqual([providerId, areaId]);
  expect(String(areaLink[0])).toMatch(/is_primary[\s\S]*TRUE/i);
});
