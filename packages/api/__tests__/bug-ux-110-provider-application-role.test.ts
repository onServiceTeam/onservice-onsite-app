const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: (client: { query: (...args: unknown[]) => unknown }) => unknown) =>
      cb({ query: (...args: unknown[]) => dbQueryMock(...args) }),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createProviderApplication } from '../src/services/provider.service';

it('BUG-UX-110 — submitting an application keeps the account in its customer role', async () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const serviceAreaId = '11111111-1111-4111-8111-111111111111';
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ role: 'customer', is_active: true, is_flagged_fraud: false }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // No active draft in this older-client fixture.
    .mockResolvedValueOnce({
      rows: [{
        id: serviceAreaId,
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
    .mockResolvedValueOnce({ rows: [{ id: '33333333-3333-4333-8333-333333333333' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'provider-1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await createProviderApplication(userId, {
    businessName: 'Cebu Home Care',
    categoryIds: ['33333333-3333-4333-8333-333333333333'],
    serviceAreaId,
    serviceRadiusKm: 10,
    latitude: 10.3157,
    longitude: 123.8854,
    city: 'Cebu City',
    province: 'Cebu',
    governmentIdFrontUrl: `https://cdn.example/onboarding/${userId}/front.jpg`,
    governmentIdBackUrl: `https://cdn.example/onboarding/${userId}/back.jpg`,
    nbiClearanceUrl: `https://cdn.example/onboarding/${userId}/nbi.jpg`,
    selfieUrl: `https://cdn.example/onboarding/${userId}/selfie.jpg`,
  });

  const sqlCalls = dbQueryMock.mock.calls.map((call) => String(call[0]));
  expect(sqlCalls.some((sql) => /UPDATE\s+users\s+SET\s+role/i.test(sql))).toBe(false);
  expect(sqlCalls.some((sql) => /INSERT INTO providers[\s\S]*'pending'/i.test(sql))).toBe(true);
});
