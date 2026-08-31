const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { createServiceArea } from '../src/services/service-area.service';

it('Bug UX-780 — a valid market boundary is not silently capped by the provider travel-radius limit', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 'area-1', name: 'Regional Market' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }], rowCount: 1 });

  await createServiceArea({
    name: 'Regional Market', city: 'Davao City', province: 'Davao del Sur', region: 'Region XI',
    centerLat: 7.0731, centerLng: 125.6128, radiusKm: 80,
    createdByAdminId: 'super-1', reason: 'Using the reviewed regional market boundary for launch planning.',
  });

  const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO service_areas/.test(sql as string));
  expect((insert![1] as unknown[])[8]).toBe(80);
});
