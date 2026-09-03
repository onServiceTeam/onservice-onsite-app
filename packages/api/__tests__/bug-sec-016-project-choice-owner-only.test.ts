const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateSelection } from '../src/services/project.service';

const projectRow = {
  id: 'project-016', customer_id: 'customer-016', provider_id: null, category_id: null,
  title: 'Interior plan', description: '', address: null, city: 'Cebu City', status: 'planning',
  estimated_total: null, created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01'),
};

it('Bug SEC-016 — choice edits belong to the customer owner and do not inherit hidden Admin project-write authority', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-016' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [projectRow], rowCount: 1 });

  await expect(updateSelection(
    'selection-016',
    { userId: 'admin-016', role: 'admin' },
    { value: 'Admin override' },
  )).rejects.toMatchObject({ statusCode: 403 });
  expect(dbQueryMock.mock.calls.some(([sql]) => String(sql).includes('UPDATE project_selections'))).toBe(false);

  dbQueryMock.mockReset();
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ project_id: 'project-016' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [projectRow], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'selection-016', project_id: 'project-016', category: 'Cabinetry', label: 'Finish',
        value: 'Matte white', detail: null, sort_order: 0, created_at: new Date('2026-09-01'),
      }],
      rowCount: 1,
    });

  const result = await updateSelection(
    'selection-016',
    { userId: 'customer-016', role: 'customer' },
    { value: 'Matte white', detail: null },
  );
  expect(result).toMatchObject({ id: 'selection-016', value: 'Matte white', detail: null });
  const updateCall = dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('UPDATE project_selections'));
  expect(updateCall?.[1]).toEqual(['Matte white', null, 'selection-016']);
});
