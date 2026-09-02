const clientQueryMock = jest.fn();
const transactionMock = jest.fn((callback: (client: { query: typeof clientQueryMock }) => unknown) =>
  callback({ query: clientQueryMock }));

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: transactionMock },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createTemplate, updateTemplate } from '../src/services/notification-template.service';

it('Bug OPS-366 — connected templates reject false SMS or email channel authority at every write boundary', async () => {
  await expect(createTemplate('admin-1', {
    slug: 'new_job_available',
    titleTemplate: 'New job available',
    bodyTemplate: '{{serviceName}} in {{city}} is worth {{amount}} for booking {{bookingId}}.',
    type: 'booking_update',
    channel: 'sms',
    reason: 'Testing a false SMS delivery mutation.',
  })).rejects.toMatchObject({ statusCode: 409 });
  expect(transactionMock).not.toHaveBeenCalled();

  clientQueryMock.mockResolvedValueOnce({
    rows: [{
      id: 'template-1', slug: 'booking_matched', title_template: 'Provider assigned',
      body_template: '{{providerName}} accepted booking {{bookingId}}.', type: 'booking_update',
      channel: 'all', is_active: true, variables: ['providerName', 'bookingId'],
      created_by: null, updated_by: null, created_at: new Date('2026-09-02T00:00:00.000Z'),
      updated_at: new Date('2026-09-02T00:00:00.000Z'),
    }],
  });

  await expect(updateTemplate('template-1', 'admin-1', {
    channel: 'email',
    reason: 'Testing a false email delivery mutation.',
  }))
    .rejects.toMatchObject({ statusCode: 409 });
  expect(clientQueryMock).toHaveBeenCalledTimes(1);
});
