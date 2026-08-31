jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { renderTemplate } from '../src/services/notification-template.service';

it('Bug UX-675 — runtime rendering rejects unresolved placeholders so delivery uses fallback copy', () => {
  expect(() => renderTemplate({
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
    created_at: new Date('2026-08-31T00:00:00.000Z'),
    updated_at: new Date('2026-08-31T00:00:00.000Z'),
  }, {
    providerName: 'Maria Santos',
  })).toThrow(/missing runtime variable bookingId/i);
});
