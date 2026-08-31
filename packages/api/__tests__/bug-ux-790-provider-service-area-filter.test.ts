const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { listProviders } from '../src/services/admin.service';

it('Bug UX-790 — the provider queue resolves a Service Areas cross-link through the canonical assignment table', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'provider-1' }] });
  const serviceAreaId = '11111111-1111-4111-8111-111111111111';

  const result = await listProviders({ serviceAreaId, status: 'approved', page: 1, pageSize: 20 });
  const [countSql, countParams] = queryMock.mock.calls[0] as [string, unknown[]];

  expect(countSql).toMatch(/EXISTS[\s\S]*provider_service_areas psa/);
  expect(countSql).toMatch(/psa\.provider_id = p\.id/);
  expect(countParams).toEqual(['approved', serviceAreaId]);
  expect(result.total).toBe(1);
});
