jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { formatTemplate } from '../src/services/notification-template.service';

it('Bug OPS-365 — connected template projection reports the channels the live workflow actually delivers', () => {
  expect(formatTemplate({
    id: 'template-1',
    slug: 'booking_matched',
    title_template: 'Provider assigned',
    body_template: '{{providerName}} accepted booking {{bookingId}}.',
    type: 'booking_update',
    channel: 'all',
    is_active: true,
    variables: ['providerName', 'bookingId'],
    created_by: null,
    updated_by: null,
    created_at: new Date('2026-09-02T00:00:00.000Z'),
    updated_at: new Date('2026-09-02T00:00:00.000Z'),
  })).toMatchObject({
    runtimeStatus: 'connected',
    runtimeChannels: ['in_app', 'push'],
  });
});
