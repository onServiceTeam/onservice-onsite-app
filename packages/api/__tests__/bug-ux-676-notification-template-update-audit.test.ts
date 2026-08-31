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

import { updateTemplate } from '../src/services/notification-template.service';

it('Bug UX-676 — notification copy updates store the before and after state in the same admin transaction', async () => {
  const before = {
    id: 'template-1', slug: 'booking_matched', title_template: 'Provider matched',
    body_template: '{{providerName}} matched booking {{bookingId}}.', type: 'booking_update',
    channel: 'all', is_active: true, variables: ['providerName', 'bookingId'],
    created_by: null, updated_by: null, created_at: new Date('2026-08-01T00:00:00.000Z'),
    updated_at: new Date('2026-08-01T00:00:00.000Z'),
  };
  const after = { ...before, title_template: 'Provider assigned', updated_by: 'admin-1' };
  clientQueryMock
    .mockResolvedValueOnce({ rows: [before] })
    .mockResolvedValueOnce({ rows: [after] })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await updateTemplate('template-1', 'admin-1', { titleTemplate: 'Provider assigned' });

  const auditCall = clientQueryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO admin_actions'));
  expect(JSON.parse(String(auditCall?.[1]?.[2]))).toMatchObject({
    op: 'update',
    slug: 'booking_matched',
    before: { titleTemplate: 'Provider matched' },
    after: { titleTemplate: 'Provider assigned' },
  });
});
