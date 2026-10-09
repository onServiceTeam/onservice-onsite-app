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

it('Bug OPS-369 — a connected template created without a channel stores the truthful legacy runtime marker', async () => {
  clientQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }] })
    .mockResolvedValueOnce({
      rows: [{
        id: 'template-1',
        slug: 'new_job_available',
        title_template: 'New job available',
        body_template: '{{serviceName}} in {{city}} is worth {{amount}} for booking {{bookingId}}.',
        type: 'booking_update',
        channel: 'all',
        is_active: true,
        variables: ['serviceName', 'city', 'amount', 'bookingId'],
        created_by: 'admin-1',
        updated_by: null,
        created_at: new Date('2026-09-02T00:00:00.000Z'),
        updated_at: new Date('2026-09-02T00:00:00.000Z'),
      }],
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await createTemplate('admin-1', {
    slug: 'new_job_available',
    titleTemplate: 'New job available',
    bodyTemplate: '{{serviceName}} in {{city}} is worth {{amount}} for booking {{bookingId}}.',
    type: 'booking_update',
    reason: 'Publishing reviewed provider job-availability copy.',
  });

  const insertCall = clientQueryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO notification_templates'));
  expect(insertCall?.[1]?.[4]).toBe('all');
});
