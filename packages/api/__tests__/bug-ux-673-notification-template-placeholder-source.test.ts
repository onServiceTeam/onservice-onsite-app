jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { deriveTemplateVariables } from '../src/services/notification-template.service';

it('Bug UX-673 — notification variables are derived once from the actual title and body copy', () => {
  expect(deriveTemplateVariables(
    'Booking {{bookingId}} is ready',
    '{{providerName}} accepted booking {{bookingId}}.',
  )).toEqual(['bookingId', 'providerName']);
});
