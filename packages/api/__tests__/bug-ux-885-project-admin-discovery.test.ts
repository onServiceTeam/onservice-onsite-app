const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listProjectsForAdmin } from '../src/services/project.service';

it('Bug UX-885 — Admin project discovery searches the full joined index and returns bounded result-wide totals plus one deterministic page', async () => {
  const project = {
    id: 'project-21', customer_id: 'customer-1', provider_id: 'provider-1', category_id: null,
    title: 'Roof plan', description: 'Inspect this plan', address: null, city: 'Mandaue City', status: 'active',
    estimated_total: null, customer_name: 'Jose Ramos', provider_name: 'Ramos Builders',
    created_at: new Date('2026-08-01'), updated_at: new Date('2026-08-01'),
  };
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ total: 41, active_projects: 41, legacy_provider_links: 8 }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [project], rowCount: 1 });

  const result = await listProjectsForAdmin({ search: 'Ramos_%', status: 'active', page: 2, pageSize: 20 });

  expect(result).toMatchObject({
    total: 41,
    page: 2,
    pageSize: 20,
    summary: { totalProjects: 41, activeProjects: 41, legacyProviderLinks: 8 },
    projects: [{ id: 'project-21', customerName: 'Jose Ramos', providerName: 'Ramos Builders' }],
  });
  expect(dbQueryMock.mock.calls[0]?.[0]).toMatch(/JOIN users customer/);
  expect(dbQueryMock.mock.calls[0]?.[0]).toMatch(/provider\.business_name/);
  expect(dbQueryMock.mock.calls[0]?.[1]).toEqual(['active', '%Ramos\\_\\%%']);
  expect(dbQueryMock.mock.calls[1]?.[0]).toMatch(/ORDER BY p\.created_at DESC, p\.id DESC/);
  expect(dbQueryMock.mock.calls[1]?.[1]).toEqual(['active', '%Ramos\\_\\%%', 20, 20]);
});
