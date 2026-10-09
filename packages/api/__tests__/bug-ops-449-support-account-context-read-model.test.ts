const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getSupportAccountContext } from '../src/services/support-ticket.service';

it('Bug OPS-449 - Support owner context comes from the participant account without raw contact fields', async () => {
  const userId = '44900000-abcd-4abc-8def-000000000449';
  const providerId = '44900000-abcd-4abc-8def-000000000450';
  queryMock.mockResolvedValueOnce({
    rows: [{
      id: userId,
      role: 'provider_staff',
      first_name: 'Lea',
      last_name: 'Ramos',
      is_active: false,
      provider_id: providerId,
      provider_business_name: 'Cebu Care Services',
    }],
  });

  const context = await getSupportAccountContext(userId, 'admin');

  expect(context).toEqual({
    id: userId,
    role: 'provider_staff',
    displayName: 'Lea R.',
    isActive: false,
    providerProfileId: providerId,
    providerBusinessName: 'Cebu Care Services',
  });
  const [sql, values] = queryMock.mock.calls[0] as [string, unknown[]];
  expect(values).toEqual([userId]);
  expect(sql).toContain("u.role IN ('customer', 'provider', 'provider_staff')");
  expect(sql).not.toMatch(/u\.phone|u\.email/);
});
