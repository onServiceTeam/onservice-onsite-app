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

it('Bug SEC-027 — a stale operator view cannot overwrite a newer pricing draft', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{}], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'rule-027',
        publication_status: 'draft',
        updated_at: new Date('2026-09-02T02:00:00.000Z'),
      }],
      rowCount: 1,
    });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  await expect(updatePricingRuleDraft('rule-027', {
    multiplier: 1.75,
    expectedUpdatedAt: '2026-09-02T01:00:00.000Z',
    reason: 'Changing the draft from an outdated browser tab.',
  }, 'actor-1')).rejects.toMatchObject({ statusCode: 409 });

  expect(queryMock.mock.calls.some((call) => String(call[0]).includes('UPDATE pricing_rules'))).toBe(false);
  expect(queryMock.mock.calls.some((call) => String(call[0]).includes('INSERT INTO admin_actions'))).toBe(false);
});
