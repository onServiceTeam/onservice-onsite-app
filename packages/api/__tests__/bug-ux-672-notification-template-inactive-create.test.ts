const clientQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (callback: (client: { query: typeof clientQueryMock }) => unknown) =>
      callback({ query: clientQueryMock }),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createTemplate } from '../src/services/notification-template.service';

it('Bug UX-672 — creating an inactive notification template persists the inactive state', async () => {
  clientQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }] })
    .mockResolvedValueOnce({
      rows: [{
        id: 'template-1',
        slug: 'reference_notice',
        title_template: 'Reference notice',
        body_template: 'Hello {{customerName}}, this is reference copy.',
        type: 'system',
        channel: 'in_app',
        is_active: false,
        variables: ['customerName'],
        created_by: 'admin-1',
        updated_by: null,
        created_at: new Date('2026-08-31T00:00:00.000Z'),
        updated_at: new Date('2026-08-31T00:00:00.000Z'),
      }],
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  const created = await createTemplate('admin-1', {
    slug: 'reference_notice',
    titleTemplate: 'Reference notice',
    bodyTemplate: 'Hello {{customerName}}, this is reference copy.',
    type: 'system',
    channel: 'in_app',
    isActive: false,
  });

  const insertCall = clientQueryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO notification_templates'));
  expect(insertCall?.[1]).toEqual([
    'reference_notice',
    'Reference notice',
    'Hello {{customerName}}, this is reference copy.',
    'system',
    'in_app',
    false,
    JSON.stringify(['customerName']),
    'admin-1',
  ]);
  expect(created.is_active).toBe(false);
});
