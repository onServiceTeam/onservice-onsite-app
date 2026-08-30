const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn() }));

import { getProviderActivity } from '../src/services/provider-admin.service';

it('Bug UX-459 — provider activity merges attributable admin actions with provider account and login history', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      user_id: 'provider-user-1', phone: '+639171234567', first_name: 'Paolo', last_name: 'Santos',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{
      id: 'action-1', admin_id: 'admin-1', admin_first: 'Support', admin_last: 'Lead',
      action_type: 'provider_suspended', reason: 'Identity risk confirmed.', details: {},
      created_at: new Date('2026-08-30T00:00:00.000Z'),
    }], rowCount: 1 });

  const result = await getProviderActivity('provider-1', 50, 'super_admin');

  expect(result).toEqual([expect.objectContaining({
    id: 'admin_action:action-1', source: 'admin_action', action: 'provider_suspended',
    detail: 'Identity risk confirmed.',
    actor: { kind: 'admin', id: 'admin-1', name: 'Support Lead' },
  })]);
  expect(queryMock.mock.calls[3][0]).toContain("a.target_type = 'provider_staff'");
  expect(queryMock.mock.calls[3][0]).toContain("a.target_type = 'review'");
});
