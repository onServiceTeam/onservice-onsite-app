const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getProjectDetail } from '../src/services/project.service';

it('Bug UX-882 — exact project detail includes the customer and legacy provider identities needed for an Admin support handoff', async () => {
  const project = {
    id: 'project-1', customer_id: 'customer-1', provider_id: 'provider-1', category_id: null,
    title: 'Roof redesign', description: 'Plan the work', address: null, city: 'Mandaue City', status: 'planning',
    estimated_total: null, customer_name: 'Jose Ramos', provider_name: 'Ramos Builders',
    created_at: new Date('2026-08-01'), updated_at: new Date('2026-08-01'),
  };
  dbQueryMock
    .mockResolvedValueOnce({ rows: [project], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const detail = await getProjectDetail('project-1', { userId: 'admin-1', role: 'admin' });

  expect(detail).toMatchObject({ customerName: 'Jose Ramos', providerName: 'Ramos Builders' });
  expect(dbQueryMock.mock.calls[0]?.[0]).toMatch(/JOIN users customer/);
  expect(dbQueryMock.mock.calls[0]?.[0]).toMatch(/LEFT JOIN providers provider/);
});
