const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

import { getProviderActivity } from '../src/services/provider-admin.service';

it('Bug OPS-434 - a provider-authored application submission is attributed to the provider, not an Admin', async () => {
  const providerUserId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{
      user_id: providerUserId, phone: '+639171234567', first_name: 'Paolo', last_name: 'Santos',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{
      id: 'action-1',
      admin_id: providerUserId,
      admin_first: 'Paolo',
      admin_last: 'Santos',
      action_type: 'provider_application_submitted',
      reason: 'Provider submitted application for review',
      details: {},
      created_at: new Date('2026-09-03T09:00:00.000Z'),
    }], rowCount: 1 });

  const result = await getProviderActivity('provider-1', 50, 'admin');

  expect(result).toEqual([expect.objectContaining({
    id: 'admin_action:action-1',
    action: 'provider_application_submitted',
    actor: { kind: 'provider', id: providerUserId, name: 'Paolo Santos' },
  })]);
});
