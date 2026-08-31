const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: transactionMock },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createTemplate } from '../src/services/notification-template.service';

it('Bug UX-674 — a connected template rejects placeholders its live workflow cannot supply', async () => {
  await expect(createTemplate('admin-1', {
    slug: 'booking_matched',
    titleTemplate: 'Provider assigned',
    bodyTemplate: '{{providerName}} arrives at {{scheduledTime}} for {{bookingId}}.',
    type: 'booking_update',
    channel: 'all',
  })).rejects.toMatchObject({ statusCode: 400 });
  expect(transactionMock).not.toHaveBeenCalled();
});
