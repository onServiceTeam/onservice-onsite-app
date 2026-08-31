const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { getServiceAreaStats } from '../src/services/service-area.service';

it('Bug UX-789 — the service-area provider KPI counts only approved providers represented by the UI label', async () => {
  queryMock.mockImplementation(async (sql: string) => {
    if (/FROM service_areas$/.test(sql.trim())) return { rows: [{ total: '1', active: '1' }] };
    if (/FROM provider_service_areas/.test(sql)) return { rows: [{ count: '4' }] };
    if (/FROM area_waitlist/.test(sql)) return { rows: [{ total: '0', pending: '0', notified: '0' }] };
    if (/GROUP BY status/.test(sql)) return { rows: [{ status: 'active', count: '1' }] };
    return { rows: [] };
  });

  const stats = await getServiceAreaStats();
  const providerQuery = queryMock.mock.calls.find(([sql]) => /FROM provider_service_areas/.test(sql as string));

  expect(providerQuery![0]).toMatch(/JOIN providers p/);
  expect(providerQuery![0]).toMatch(/p\.status = 'approved'/);
  expect(stats.totalProviders).toBe(4);
});
