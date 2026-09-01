const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updatePricingRuleDraft } from '../src/services/pricing-publication.service';

it('Bug OPS-323 — published pricing terms cannot be edited in place', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{}], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: '00000000-0000-4000-8000-000000000323',
        publication_status: 'published',
      }],
      rowCount: 1,
    });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  await expect(updatePricingRuleDraft(
    '00000000-0000-4000-8000-000000000323',
    {
      multiplier: 2,
      expectedUpdatedAt: '2026-09-02T00:00:00.000Z',
      reason: 'Attempting to rewrite a published customer price.',
    },
    '00000000-0000-4000-8000-000000000001',
  )).rejects.toMatchObject({ statusCode: 409 });

  expect(queryMock.mock.calls.some((call) => String(call[0]).includes('UPDATE pricing_rules'))).toBe(false);
  expect(queryMock.mock.calls.some((call) => String(call[0]).includes('INSERT INTO admin_actions'))).toBe(false);
});
